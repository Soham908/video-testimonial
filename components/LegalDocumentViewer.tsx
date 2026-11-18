import { useState } from 'react';
import { Keyboard, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useStrings } from '../i18n/useStrings';
import { getLegalDocument, getLegalUrl, LEGAL_RELEASE, POLICY_UPDATED_DATE, type LegalDocumentId } from '../legalDocuments';
import { reapplyNavigationBarStyle } from '../theme/NavigationBarSync';
import { BottomSystemBarBackground, SYSTEM_BAR_BACKGROUND } from '../theme/SystemBarFrame';

export function LegalDocumentViewer({ document, onClose }: { document: LegalDocumentId | null; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const { t } = useStrings();
  const insets = useSafeAreaInsets();
  const [linkFailed, setLinkFailed] = useState(false);
  if (!document) return null;
  const policy = getLegalDocument(document);
  async function openWebsite() {
    try { await Linking.openURL(getLegalUrl(document!)); }
    catch { setLinkFailed(true); }
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={reapplyNavigationBarStyle}>
      <View onAccessibilityEscape={onClose} style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12 + 16 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 12, backgroundColor: SYSTEM_BAR_BACKGROUND }} />
        <View style={{ paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: 23, fontWeight: '700', color: colors.text }}>{t(`legal.${document}`)}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ padding: 12 }}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>{t('legal.close')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + spacing.edgeGap + spacing.footerGap }}>
          <Text style={{ color: colors.textMuted, marginBottom: 18 }}>{POLICY_UPDATED_DATE} · Insight Scoop / Zeist</Text>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 25, marginBottom: 16 }}>{policy.intro}</Text>
          {policy.sections.map(section => <View key={section.title} style={{ marginBottom: 24 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{section.title}</Text>
            <Text style={{ color: colors.text, fontSize: 16, lineHeight: 25, flexShrink: 1 }}>{section.body}</Text>
          </View>)}
          <Text style={{ color: colors.textMuted, lineHeight: 24 }}>{LEGAL_RELEASE.supportEmail}</Text>
          {LEGAL_RELEASE.websitePublished && <Pressable accessibilityRole="link" onPress={openWebsite} style={{ paddingVertical: 18 }}><Text style={{ color: colors.accent, fontWeight: '600' }}>{t('legal.openWebsite')}</Text></Pressable>}
          {linkFailed && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{t('legal.linkFailed')}</Text>}
        </ScrollView>
        <BottomSystemBarBackground />
      </View>
    </Modal>
  );
}

export function LegalLinks() {
  const [document, setDocument] = useState<LegalDocumentId | null>(null);
  const { colors, spacing } = useTheme();
  const { t } = useStrings();
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 }}>
      {(['privacy', 'terms'] as const).map(id => <Pressable key={id} accessibilityRole="link" onPress={() => { Keyboard.dismiss(); setDocument(id); }} style={{ paddingHorizontal: 10, paddingVertical: 12 }}><Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '600' }}>{t(`legal.${id}`)}</Text></Pressable>)}
    </View>
    <LegalDocumentViewer document={document} onClose={() => setDocument(null)} />
  </>;
}
