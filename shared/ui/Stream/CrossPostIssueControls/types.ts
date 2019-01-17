export interface Service {
	name: string;
	displayName: string;
	icon?: string;
}

export interface CardValues {
	service: string;
	board?: Board;
	[key: string]: any;
}
export type CrossPostIssueValuesListener = (values: CardValues) => any;

export interface Board {
	id: string;
	name: string;
	assigneesRequired: boolean;
	assigneesDisabled?: boolean;
	[key: string]: any;
}

export const SUPPORTED_SERVICES = {
	Trello: { name: "trello", displayName: "Trello" },
	Jira: { name: "jira", displayName: "Jira" },
	GitHub: { name: "github", icon: "mark-github", displayName: "GitHub" },
	GitLab: { name: "gitlab", displayName: "GitLab" },
	Asana: { name: "asana", displayName: "Asana" },
	Bitbucket: { name: "bitbucket", displayName: "Bitbucket" }
};
