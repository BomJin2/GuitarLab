export function preventDroppedFileNavigation(event: {
  dataTransfer: Pick<DataTransfer, 'types'> | null;
  preventDefault: () => void;
}) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
}
