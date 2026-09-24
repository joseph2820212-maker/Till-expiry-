export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertConfig = {
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  isError?: boolean;
  isSuccess?: boolean;
};

let _listener: ((config: AlertConfig | null) => void) | null = null;

export const AppAlert = {
  register(fn: (config: AlertConfig | null) => void): void {
    _listener = fn;
  },
  unregister(): void {
    _listener = null;
  },
  /** Generic / confirm / info dialog — title shown in navy */
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    _listener?.({ title, message, buttons });
  },
  /** Error dialog — title is always t('common.error') in dark orange, no icon */
  error(message: string, buttons?: AlertButton[]): void {
    _listener?.({ message, buttons, isError: true });
  },
  /** Success / done / saved dialog — title shown in navy, no "Error" word */
  success(title: string, message?: string, buttons?: AlertButton[]): void {
    _listener?.({ title, message, buttons, isSuccess: true });
  },
};
