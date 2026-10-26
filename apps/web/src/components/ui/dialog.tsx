import { usePreferences } from '../../preferences';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './button';
export function Confirm({
  title,
  description,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const { t } = usePreferences();
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="actions">
            <Dialog.Close asChild>
              <Button variant="outline">{t('Cancel')}</Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button variant="destructive" onClick={onConfirm}>
                {t('Confirm')}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
