export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input,textarea,select,[role="textbox"]')) return true;
  for (
    let element: Element | null = target;
    element;
    element = element.parentElement
  ) {
    const value = element.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only')
      return true;
  }
  return false;
}
