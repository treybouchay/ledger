/** Consistent destructive-action confirmation. */
export function confirmRemove(detail: string): boolean {
  const message = detail.trim()
  if (!message) return window.confirm('Are you sure?')
  if (/^are you sure\b/i.test(message)) return window.confirm(message)
  return window.confirm(`Are you sure?\n\n${message}`)
}
