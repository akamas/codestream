'use strict';
import { commands, Disposable, Extension, extensions, MessageItem, window, workspace } from 'vscode';
import { Post, SessionStatus, SessionStatusChangedEvent } from '../api/session';
import { Command, CommandOptions } from '../commands';
import { ContextKeys, setContext } from '../common';
import { TraceLevel } from '../configuration';
import { Container } from '../container';
import { ExtensionId } from '../extension';
import { UserNode } from '../views/explorer';
import { Logger } from '../logger';
import { RemoteGitService, RemoteRepository } from '../git/remoteGitService';
import { Iterables } from '../system';

const liveShareRegex = /https:\/\/(?:.*?)liveshare(?:.*?).visualstudio.com\/join\?(.*?)(?:\s|$)/;
let liveShare: Extension<any> | undefined;

interface LiveShareContext {
    url: string;
    sessionId: string;
    sessionUserId: string;
    memberIds: string[];
    repos: RemoteRepository[];
}

interface InviteCommandArgs {
    userIds: string | string[];
}

interface JoinCommandArgs {
    context: LiveShareContext;
    url: string;
}

const commandRegistry: Command[] = [];

export class LiveShareController extends Disposable {

    static ensureLiveShare(): boolean {
        if (liveShare === undefined) {
            liveShare = extensions.getExtension('ms-vsliveshare.vsliveshare');
        }

        return liveShare !== undefined;
    }

    private readonly _disposable: Disposable | undefined;

    constructor() {
        super(() => this.dispose());

        if (!LiveShareController.ensureLiveShare()) return;

        setContext(ContextKeys.LiveShareInstalled, true);

        this._disposable = Disposable.from(
            ...commandRegistry.map(({ name, key, method }) => commands.registerCommand(name, (...args: any[]) => method.apply(this, args))),
            Container.session.onDidChangeStatus(this.onSessionStatusChanged, this),
            Container.linkActions.register<LiveShareContext>('vsls', 'join', { onMatch: this.onJoinMatch, onAction: this.onJoinAction }, this)
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    get isInstalled() {
        return liveShare !== undefined;
    }

    get sessionId() {
        return workspace.getConfiguration('vsliveshare').get<string>('join.reload.workspaceId');
    }

    private onJoinAction(e: LiveShareContext) {
        return this.join({
            context: e,
            url: e.url
        });
    }

    private async onJoinMatch(post: Post, e: LiveShareContext) {
        // const match = liveShareRegex.exec(e.url);
        // if (match == null) return;

        Logger.log('LiveShareController.onRequestReceived: ', `data=${JSON.stringify(e)}`);

        const host = await Container.session.users.get(e.sessionUserId);

        if (host === undefined) {
            Logger.log('LiveShareController.onRequestReceived: ', `Could not find host User(${e.sessionUserId})`);
            debugger;
            return;
        }

        Logger.log('LiveShareController.onRequestReceived: ', `Host(${host.name}) User(${host.id}) found`);

        // Only notify if we've been mentioned
        if (!post.mentioned(Container.session.user.name)) return;

        const actions: MessageItem[] = [
            { title: 'Join Live Share' },
            { title: 'Ignore', isCloseAffordance: true }
        ];

        const result = await window.showInformationMessage(`${host.name} is inviting you to join a Live Share session`, ...actions);
        if (result === actions[0]) {
            this.onJoinAction(e);
        }
    }

    private onSessionStatusChanged(e: SessionStatusChangedEvent) {
        const sessionId = this.sessionId;
        // If we aren't in an active (remote) live share session kick out
        if (sessionId === undefined) return;

        const status = e.getStatus();
        if (status === SessionStatus.SignedOut) return;

        const context = Container.context.globalState.get<LiveShareContext>(`vsls:${sessionId}`);
        if (context === undefined) {
            Logger.warn('Unable to find live share context');
            return;
        }

        switch (status) {
            case SessionStatus.SigningIn:
                // Since we are in a live share session, swap out our git service
                Container.overrideGit(new RemoteGitService(context.repos));
                break;

            case SessionStatus.SignedIn:
                // When we are signed in, open a channel for the liveshare
                this.openStream(sessionId, context.sessionUserId, context.memberIds);
                break;
        }
    }

    @command('invite')
    async invite(args: UserNode | InviteCommandArgs) {
        if (!this.isInstalled) throw new Error('Live Share is not installed');

        let streamThread;
        const users = [];
        if (args instanceof UserNode) {
            users.push(args.user);
            streamThread = { id: undefined, stream: await Container.session.directMessages.getOrCreateByMembers([Container.session.userId, args.user.id]) };
        }
        else {
            if (typeof args.userIds === 'string') {
                const user = await Container.session.users.get(args.userIds);
                if (user !== undefined) {
                    users.push();
                }
            }
            else {
                for (const id of args.userIds) {
                    const user = await Container.session.users.get(id);
                    if (user !== undefined) {
                        users.push();
                    }
                }
            }
            streamThread = Container.streamView.activeStreamThread;
        }

        Logger.log('LiveShareController.invite: ', `Users=${JSON.stringify(users.map(u => ({ id: u.id, name: u.name })))}`);

        const result = await commands.executeCommand('liveshare.start', { suppressNotification: true });
        if (result === undefined) return;

        const match = liveShareRegex.exec(result.toString());
        if (match == null) return;

        const [url, sessionId] = match;

        const memberIds = [Container.session.userId, ...users.map(u => u.id)];
        await this.openStream(sessionId, Container.session.userId, memberIds);

        const repos = Iterables.map(await Container.session.repos.items(), r => ({ id: r.id, hash: r.hash, normalizedUrl: r.normalizedUrl, url: r.url } as RemoteRepository));

        const link = Container.linkActions.toLinkAction<LiveShareContext>(
            'vsls',
            'join',
            {
                url: url,
                sessionId: sessionId,
                sessionUserId: Container.session.userId,
                memberIds: memberIds,
                repos: [...repos]
            },
            {
                type: 'link',
                label: ` join my Live Share session`
            });

        return await Container.commands.post({
            streamThread: streamThread,
            text: `${users.map(u => `@${u.name}`).join(', ')} please ${link}`,
            send: true,
            silent: true
        });
    }

    @command('join')
    async join(args: JoinCommandArgs) {
        await Container.context.globalState.update(`vsls:${args.context.sessionId}`, args.context);
        await commands.executeCommand('liveshare.join', args.url); // , { newWindow: true });

        this.openStream(args.context.sessionId, args.context.sessionUserId, args.context.memberIds);
    }

    private async openStream(sessionId: string, sessionUserId: string, memberIds: string[]) {
        const stream = await Container.session.channels.getOrCreateByName(`ls:${sessionUserId}:${sessionId}`, { membership: memberIds });
        return await Container.commands.openStream({ streamThread: { id: undefined, stream: stream } });
    }
}

function command(command: string, options: CommandOptions = {}): Function {
    return (target: any, key: string, descriptor: any) => {
        if (!(typeof descriptor.value === 'function')) throw new Error('not supported');

        let method;
        if (!options.customErrorHandling) {
            method = async function(this: any, ...args: any[]) {
                try {
                    return await descriptor.value.apply(this, args);
                }
                catch (ex) {
                    Logger.error(ex);

                    if (options.showErrorMessage) {
                        if (Container.config.traceLevel !== TraceLevel.Silent) {
                            const actions: MessageItem[] = [
                                { title: 'Open Output Channel' }
                            ];

                            const result = await window.showErrorMessage(`${options.showErrorMessage} \u00a0\u2014\u00a0 ${ex.toString()}`, ...actions);
                            if (result === actions[0]) {
                                Logger.showOutputChannel();
                            }
                        }
                        else {
                            window.showErrorMessage(`${options.showErrorMessage} \u00a0\u2014\u00a0 ${ex.toString()}`);
                        }
                    }
                }
            };
        }
        else {
            method = descriptor.value;
        }

        commandRegistry.push({
            name: `${ExtensionId}.vsls.${command}`,
            key: key,
            method: method,
            options: options
        });
    };
}
