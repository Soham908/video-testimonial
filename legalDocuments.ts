import release from './release/insight-scoop/config.json';
import policies from './release/insight-scoop/content/policies.json';

export type LegalDocumentId = keyof typeof policies;
export const POLICY_VERSION = release.policyVersion;
export const POLICY_UPDATED_DATE = release.policyUpdatedDate;
export const LEGAL_RELEASE = release;
export function getLegalDocument(id: LegalDocumentId) {
  const fields: Record<string, string> = {
    legalEntityName: release.legalEntityName ?? 'Zeist (full legal operator pending confirmation)',
    supportEmail: release.supportEmail,
    retentionSchedule: release.retentionSchedule ?? 'awaiting Zeist approval before publication',
    backupDeletionPeriod: release.backupDeletionPeriod ?? 'awaiting Zeist approval before publication',
    deletionInstructions: release.backendDeletionDeployed
      ? `Use Delete account in Profile or the deletion-request page on ${release.websiteBaseUrl}/delete-account.html.`
      : `During this pre-release stage, contact ${release.supportEmail} about deletion requests. The automated in-app deletion process is not yet enabled for users and must be verified before production release.`,
  };
  const format = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, field: string) => fields[field] ?? `[${field}]`);
  return { ...policies[id], intro: format(policies[id].intro), sections: policies[id].sections.map(section => ({ ...section, body: format(section.body) })) };
}

// Stable public paths; changing the hosting domain does not change app identity.
export function getLegalUrl(id: LegalDocumentId): string {
  return `${release.websiteBaseUrl.replace(/\/$/, '')}/${id}.html`;
}
