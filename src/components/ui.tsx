import * as Tooltip from '@radix-ui/react-tooltip';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/utils';

/* ---------------- Tooltip ---------------- */
export function Tip({
  label,
  shortcut,
  children,
  side = 'bottom',
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="anim-pop z-50 flex items-center gap-2 rounded-md bg-s4 px-2 py-1 text-[11.5px] font-medium text-fg shadow-pop"
        >
          {label}
          {shortcut && <span className="kbd">{shortcut}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/* ---------------- Buttons ---------------- */
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'default' | 'accent';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, tipSide, active, size = 'md', tone = 'default', className, children, ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform,filter] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40',
        tone === 'accent'
          ? 'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110'
          : 'text-muted hover:bg-s4 hover:text-fg',
        size === 'md' ? 'h-8 w-8' : 'h-6.5 w-6.5 rounded-md',
        active && 'bg-accent-soft text-accent-strong hover:bg-accent-soft hover:text-accent-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      {btn}
    </Tip>
  );
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform,filter] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-8 px-3 text-[12.5px]' : 'h-7 px-2.5 text-[12px]',
        variant === 'primary' &&
          'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.3)] hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-s3 text-fg hover:border-line-strong hover:bg-s4',
        variant === 'ghost' && 'text-muted hover:bg-s4 hover:text-fg',
        variant === 'danger' && 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
        className,
      )}
      {...rest}
    />
  );
});

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

/* ---------------- Dialog / sheet ---------------- */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  initialFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Selector inside the sheet to focus when it opens. */
  initialFocus?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            if (!initialFocus) return;
            const el = (e.currentTarget as HTMLElement)?.querySelector<HTMLElement>(initialFocus);
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
          aria-describedby={description ? undefined : undefined}
          className={cx(
            'anim-sheet fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-24px)] w-[calc(100vw-20px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line-strong bg-s2 shadow-pop',
            wide ? 'max-w-[640px]' : 'max-w-[440px]',
          )}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-fg">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[12px] text-subtle">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{String(title)}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-1">
                <X size={15} />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-line bg-s1/60 px-4 py-2.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------- Dropdown menu ---------------- */
export const MenuRoot = Menu.Root;
export const MenuTrigger = Menu.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={4}
        collisionPadding={8}
        onClick={(e) => e.stopPropagation()}
        className="anim-pop z-50 min-w-[180px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-line-strong bg-s2 p-1 shadow-pop"
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  shortcut,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className={cx(
        'flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2 text-[12.5px] outline-none transition-colors duration-100',
        danger
          ? 'text-danger data-[highlighted]:bg-danger-soft'
          : 'text-fg data-[highlighted]:bg-s4',
      )}
    >
      {icon && <span className={cx('flex w-4 justify-center', danger ? '' : 'text-muted')}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[11px] text-subtle">{shortcut}</span>}
    </Menu.Item>
  );
}

export const MenuSeparator = () => <Menu.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <Menu.Label className="section-label px-2 pt-1.5 pb-1">{children}</Menu.Label>
);
export const MenuSub = Menu.Sub;
export function MenuSubTrigger({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Menu.SubTrigger className="flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2 text-[12.5px] text-fg outline-none data-[highlighted]:bg-s4 data-[state=open]:bg-s4">
      {icon && <span className="flex w-4 justify-center text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      <span className="text-subtle">›</span>
    </Menu.SubTrigger>
  );
}
export function MenuSubContent({ children }: { children: ReactNode }) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        sideOffset={4}
        collisionPadding={8}
        className="anim-pop z-50 max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] min-w-[180px] overflow-y-auto rounded-xl border border-line-strong bg-s2 p-1 shadow-pop"
      >
        {children}
      </Menu.SubContent>
    </Menu.Portal>
  );
}

/* ---------------- Form bits ---------------- */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[11.5px] font-medium text-muted">
        {label}
        {hint && <span className="font-normal text-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-line bg-s1 px-2.5 py-1.5 text-[13px] text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-s4',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}
