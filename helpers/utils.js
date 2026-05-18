// Helper: interpolate template variables in AI responses
export function interpolateTemplates(text, variables) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}