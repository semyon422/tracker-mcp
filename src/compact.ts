// Compact only recognized API references. Never recursively strip keys from
// arbitrary custom fields: a custom value may legitimately contain `self` or `id`.
type Data = Record<string, any>;
function reference(value: any): any {
  if (Array.isArray(value)) return value.map(reference);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.self !== 'string' || !value.self.startsWith('https://api.tracker.yandex.net/')) return value;
  return Object.fromEntries(['id', 'key', 'display'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
export function compactHistory(data: Data, fullJsonPath: string) {
  const entries = data.entries.map((entry: Data) => {
    const result = {...entry};
    for (const key of ['self', 'issue', 'transport']) delete result[key];
    if ('updatedBy' in result) result.updatedBy = reference(result.updatedBy);
    if (Array.isArray(result.fields)) result.fields = result.fields.map((change: Data) => {
      const field = reference(change.field);
      // Only known reference-valued fields are reduced. Custom from/to values
      // (including objects with self/id keys) must remain untouched.
      const known = ['status', 'assignee', 'createdBy', 'updatedBy', 'followers', 'priority', 'type', 'queue', 'parent'];
      return {...change, field, ...(known.includes(change.field?.id)
        ? {from:reference(change.from), to:reference(change.to)} : {})};
    });
    return result;
  });
  return {...data, entries, format:'compact', fullJsonPath,
    note:data.note + ' Repeated issue/user metadata omitted; full original page is in fullJsonPath.'};
}
export function compactIssue(data: Data, fullJsonPath: string) {
  const issue = {...data.issue};
  for (const key of ['self', 'version', 'favorite']) delete issue[key];
  for (const key of ['assignee', 'createdBy', 'updatedBy', 'followers', 'previousStatusLastAssignee', 'status', 'previousStatus', 'priority', 'type', 'queue', 'parent']) {
    if (key in issue) issue[key] = reference(issue[key]);
  }
  const comments = data.comments.map((comment: Data) => {
    const result = {...comment};
    for (const key of ['self', 'version', 'transport', 'longId']) delete result[key];
    for (const key of ['createdBy', 'updatedBy']) if (key in result) result[key] = reference(result[key]);
    return result;
  });
  const attachments = data.attachments.map((attachment: Data) => {
    const result = {...attachment};
    delete result.self; delete result.content;
    if ('createdBy' in result) result.createdBy = reference(result.createdBy);
    return result;
  });
  const {links: _rawLinks, ...rest} = data;
  const relatedIssues = data.relatedIssues.map((link: Data) => ({...link, issue:reference(link.issue)}));
  return {...rest, issue, comments, attachments, relatedIssues, fullJsonPath,
    format:'compact', note:data.note + ' Compact API references; full original fields and download URLs are available in fullJsonPath. Related issue bodies are not fetched.'};
}
