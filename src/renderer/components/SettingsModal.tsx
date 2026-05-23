import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../store';

const ACCENTS = [
  { label: 'Amber', value: '#F5A524' },
  { label: 'Cyan', value: '#4ECCE6' },
  { label: 'Green', value: '#5BE3A8' },
  { label: 'Pink', value: '#F472B6' },
  { label: 'Purple', value: '#A78BFA' },
  { label: 'Red', value: '#F26F6F' },
];

export function SettingsModal() {
  const setShowSettings = useApp((s) => s.setShowSettings);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);

  // Apply accent color live by setting --accent on :root.
  React.useEffect(() => {
    const root = document.documentElement;
    if (settings.accentColor) root.style.setProperty('--accent', settings.accentColor);
  }, [settings.accentColor]);

  return (
    <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
      <div className="modal" style={{ width: 540, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Settings</h2>
          <button className="btn-icon" onClick={() => setShowSettings(false)}><X size={14} /></button>
        </div>
        <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <Section title="Appearance">
            <Field label="Theme">
              <select
                value={settings.theme}
                onChange={(e) => setSettings({ theme: e.target.value as any })}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
            <Field label="Accent color">
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENTS.map((a) => {
                  const active = (settings.accentColor || '#F5A524') === a.value;
                  return (
                    <button
                      key={a.value}
                      title={a.label}
                      onClick={() => setSettings({ accentColor: a.value })}
                      style={{
                        width: 22, height: 22, borderRadius: 999,
                        background: a.value,
                        border: active ? '2px solid var(--ink)' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section title="Data grid">
            <Field label="Default page size (rows)">
              <input
                type="number"
                value={settings.pageSize}
                onChange={(e) => setSettings({ pageSize: parseInt(e.target.value || '500', 10) })}
              />
            </Field>
            <Field label="Relative timestamps in cells">
              <Checkbox
                checked={!!settings.relativeTimestamps}
                onChange={(v) => setSettings({ relativeTimestamps: v })}
              />
            </Field>
          </Section>

          <Section title="SQL editor">
            <Field label="Font size">
              <input
                type="number"
                value={settings.fontSize}
                onChange={(e) => setSettings({ fontSize: parseInt(e.target.value || '13', 10) })}
              />
            </Field>
            <Field label="Tab size">
              <input
                type="number"
                value={settings.editorTabSize ?? 2}
                onChange={(e) => setSettings({ editorTabSize: parseInt(e.target.value || '2', 10) })}
              />
            </Field>
            <Field label="Show line numbers">
              <Checkbox
                checked={settings.editorLineNumbers !== false}
                onChange={(v) => setSettings({ editorLineNumbers: v })}
              />
            </Field>
            <Field label="Word wrap">
              <Checkbox
                checked={settings.editorWordWrap !== false}
                onChange={(v) => setSettings({ editorWordWrap: v })}
              />
            </Field>
            <Field label="Format SQL on run">
              <Checkbox
                checked={!!settings.formatOnRun}
                onChange={(v) => setSettings({ formatOnRun: v })}
              />
            </Field>
          </Section>

          <Section title="Safety">
            <Field label="Confirm destructive ops (DROP, TRUNCATE…)">
              <Checkbox
                checked={!!settings.confirmDangerous}
                onChange={(v) => setSettings({ confirmDangerous: v })}
              />
            </Field>
          </Section>

          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, color: 'var(--ink-3)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
            All settings persist to the local OS user config. No data leaves your machine.
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div>
      <div className="section-title" style={{ padding: 0, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <div style={{ width: 180 }}>{children}</div>
    </label>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16 }} />;
}
