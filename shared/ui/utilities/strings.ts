/** Returns a readable phrase of items. examples:
 * 		
 * 		['foo'] = "foo"
 * 		['foo','bar'] = "foo and bar"
 * 		['foo','bar','baz'] = "foo, bar, and baz"
 * 
 * @param  {string[]} items
 * @returns string
 */
export function phraseList(items: string[]): string {
	if (!items) return "";
	const length = items.length;
	if (!length) return "";
	if (length === 1) return items[0];
	if (length === 2) return `${items[0]} and ${items[1]}`;

	let results = "";
	for (let i = 0; i < length; i++) {
		results += `${items[i]}`;
		if (i < length - 1) {
			results += ', '
		}
		if (i === length - 2) {
			results += 'and ';
		}
	}
	return results;
}