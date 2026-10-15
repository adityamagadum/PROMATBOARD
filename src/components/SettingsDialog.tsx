import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Keyboard, Monitor, Moon, Sun, Upload } from 'lucide-react';
import type { ThemePref } from '../types';
import { buildExport, downloadJson, mergeImport } from '../lib/importExport';
import { hasChrome } from '../lib/storage';
import { useVault } from '../lib/store';
import { useUI } from '../lib/ui';
import { cx, modKey } from '../lib/utils';
import { Button, Sheet, Toggle } from './ui';
import { toast } from './Toaster';

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  return (
    <Sheet open={open} onOpenChange={(o) => useUI.getState().set({ settingsOpen: o })} title="Settings & data">
      {open && <SettingsBody />}
    </Sheet>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-fg">{title}</div>
        {desc && <div className="mt-0.5 text-[11.5px] text-subtle">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-1">
      <h3 className="section-label mb-1">{label}</h3>
      <div className="divide-y divide-[var(--border)] rounded-xl border border-line bg-s1 px-3">{children}</div>
    </section>
  );
}

function SettingsBody() {
  const settings = useVault((s) => s.settings);
  const folders = useVault((s) => s.folders);
  const prompts = useVault((s) => s.prompts);
  const update = useVault((s) => s.updateSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    if (hasChrome) chrome.storage.local.getBytesInUse(null).then(setBytes).catch(() => {});
  }, [prompts, folders]);

  const themes: { id: ThemePref; label: string; icon: ReactNode }[] = [
    { id: 'dark', label: 'Dark', icon: <Moon size={13} /> },
    { id: 'light', label: 'Light', icon: <Sun size={13} /> },
    { id: 'system', label: 'System', icon: <Monitor size={13} /> },
  ];

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(buildExport(folders, prompts), `promptvault-${stamp}.json`);
    toast(`Exported ${Object.keys(prompts).length} prompts`);
  };

  const doImport = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const report = mergeImport(raw, folders, prompts);
      if (!Object.keys(report.set).length) {
        toast(`Nothing new — ${report.skipped} already in your library`, { kind: 'info', duration: 3000 });
        return;
      }
      const undo = await useVault.getState().commit(report.set);
      const parts = [
        report.added && `${report.added} added`,
        report.updated && `${report.updated} updated`,
        report.skipped && `${report.skipped} skipped`,
      ].filter(Boolean);
      toast(`Imported: ${parts.join(', ')}`, { action: { label: 'Undo', run: () => void undo() }, duration: 6000 });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', { kind: 'error', duration: 3500 });
    }
  };

  return (
    <div className="pb-1">
      <Group label="Appearance">
        <Row title="Theme">
          <div className="flex rounded-lg border border-line bg-s2 p-0.5" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={settings.theme === t.id}
                onClick={() => void update({ theme: t.id })}
                className={cx(
                  'flex h-6.5 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors duration-150',
                  settings.theme === t.id ? 'bg-s4 text-fg shadow-card' : 'text-subtle hover:text-fg',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      <Group label="Behavior">
        <Row title="“Insert into page” button" desc="Types the prompt into ChatGPT, Claude or Gemini. Copy stays the main action.">
          <Toggle label="Show insert button" checked={settings.showInsert} onChange={(v) => void update({ showInsert: v })} />
        </Row>
        <Row title="Close popup after copying" desc="Handy when you go straight back to the chat.">
          <Toggle label="Close popup after copying" checked={settings.closeOnCopy} onChange={(v) => void update({ closeOnCopy: v })} />
        </Row>
        <Row title="Show welcome tips" desc="The onboarding card on Home.">
          <Toggle label="Show welcome tips" checked={!settings.onboardingDismissed} onChange={(v) => void update({ onboardingDismissed: !v })} />
        </Row>
      </Group>

      <Group label="Data">
        <Row
          title="Export library"
          desc={`${Object.keys(prompts).length} prompts, ${Object.keys(folders).length} folders${bytes != null ? ` · ${(bytes / 1024).toFixed(1)} KB stored locally` : ''}`}
        >
          <Button size="sm" onClick={doExport}>
            <Download size={13} /> Export JSON
          </Button>
        </Row>
        <Row title="Import" desc="Merges with your library. Duplicates are skipped; nothing is overwritten blindly.">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </Row>
      </Group>

      <Group label="Keyboard">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 py-2.5 text-[12px] text-muted">
          {[
            ['Open PromptVault', 'Ctrl+Shift+Y'],
            ['Open in side panel', 'Alt+Shift+Y'],
            ['Move through prompts', '↑ ↓'],
            ['Copy', '↵'],
            ['Insert into page', `${modKey}+↵`],
            ['Edit', `${modKey}+E`],
            ['Show full prompt', '→'],
            ['New prompt', `${modKey}+N`],
            ['Search', '/'],
            ['Clear / close', 'Esc'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <span>{k}</span>
              <span className="kbd justify-self-end">{v}</span>
            </div>
          ))}
        </div>
        {hasChrome && (
          <div className="py-2.5">
            <Button size="sm" variant="ghost" className="-ml-2" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
              <Keyboard size={13} /> Change shortcuts…
            </Button>
          </div>
        )}
      </Group>

      <p className="mt-3 text-center text-[11px] text-subtle">
        PromptVault 1.0 · Everything is stored locally on this device.
      </p>
    </div>
  );
}
