import type { OrgRow } from './layout';

// Distinguished names compare case-insensitively and ignore spaces after commas.
export const normDn = (dn: string) => dn.trim().replace(/\s*,\s*/g, ',').replace(/\s*=\s*/g, '=').toLowerCase();

function b64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Reads an LDIF export (from ldapsearch, Active Directory's ldifde, OpenLDAP, etc.) as org chart rows.
 * Entries without a name are skipped; `manager` links people by DN.
 */
export function parseLdif(text: string): OrgRow[] {
  const entries: Record<string, string[]>[] = [];
  let cur: Record<string, string[]> | undefined;
  // Fold continuation lines (leading single space) first.
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).reduce<string[]>((acc, l) => {
    if (l.startsWith(' ') && acc.length) acc[acc.length - 1] += l.slice(1);
    else acc.push(l);
    return acc;
  }, []);
  for (const l of lines) {
    if (!l.trim()) {
      cur = undefined;
      continue;
    }
    if (l.startsWith('#')) continue;
    const m = /^([A-Za-z0-9;.-]+)(::?)\s?(.*)$/.exec(l);
    if (!m) continue;
    const attr = m[1].split(';')[0].toLowerCase();
    let value = m[3];
    if (m[2] === '::') {
      try {
        value = attr === 'jpegphoto' || attr === 'thumbnailphoto' ? m[3].replace(/\s+/g, '') : new TextDecoder().decode(b64(m[3]));
      } catch {
        continue;
      }
    }
    if (attr === 'dn') {
      cur = { dn: [value] };
      entries.push(cur);
    } else if (cur) (cur[attr] ??= []).push(value);
  }
  const rows: OrgRow[] = [];
  for (const e of entries) {
    const one = (k: string) => e[k]?.[0]?.trim();
    const name = one('displayname') || one('cn') || [one('givenname'), one('sn')].filter(Boolean).join(' ');
    if (!name) continue;
    const photo = one('jpegphoto');
    rows.push({
      id: normDn(e.dn[0]),
      name,
      title: one('title') || one('description') || undefined,
      manager: one('manager') ? normDn(one('manager')!) : undefined,
      photo: photo ? `data:image/jpeg;base64,${photo}` : undefined,
    });
  }
  return rows;
}
