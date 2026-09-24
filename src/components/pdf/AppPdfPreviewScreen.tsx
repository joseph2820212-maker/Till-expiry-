import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import Pdf from 'react-native-pdf';
import { useTranslation } from 'react-i18next';
import { fs } from '../../theme/responsive';
import { colors } from '../../theme/colors';
import { printHtmlToPdfFile, pruneTemporaryPreviewPdfs } from '../../utils/pdfFile';
import { PAGE_SIZES } from '../../utils/pdfPageSizes';
import { safeBottom } from '../../utils/safeArea';

// ─── AppPdfPreviewScreen — Layer A: the shared RN shell around every PDF preview ─
//
// One global preview chrome for EVERY in-app PDF preview (Daily Book, Reports,
// Account statement, Accountant Pack, Invoice, Quote, File Centre export…):
//   · charcoal #33363B void around the document, #1E2024 top bar
//   · back arrow always top-left (44×44), title centred, action icons top-right
//   · the body renders the REAL PDF (generated from the document HTML via
//     expo-print) in a NATIVE PDF viewer (react-native-pdf).
//
// Why a native PDF viewer instead of an HTML WebView: the WebView laid the fixed-
// width A4 page out differently on Android (narrow layout viewport → the page was
// reflowed and shrunk) vs iOS, so previews looked small/cramped on Android. A real
// PDF renders pixel-identically on both platforms, fits to width natively, pinch-
// zooms natively, and — because it's the same file produced on export — the
// preview now matches the exported/shared PDF exactly.
//
// It owns ONLY the screen chrome + the PDF view. The document HTML (page size,
// header/footer, margins) is Layer B — built by pdfTemplates / wrapPdfHtml.

const DARK_BODY = '#33363B';
const DARK_BAR = '#1E2024';
const ICON = '#fff';
const ICON_DIM = 'rgba(255,255,255,0.3)';
// A4 portrait aspect (842/595 pt). Used until the native PDF layer reports the
// real first-page size; keeps the initial Android frame page-shaped instead of
// a tall white viewport that makes one-page PDFs look small.
const PAGE_RATIO_A4 = PAGE_SIZES.a4.height / PAGE_SIZES.a4.width;
async function isReadablePdfFile(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = typeof (info as { size?: number }).size === 'number' ? (info as { size: number }).size : null;
    return info.exists && (size === null || size > 0);
  } catch {
    return false;
  }
}

export type PdfPreviewAction = {
  key: string;
  /** Ionicons glyph name, e.g. 'download-outline' / 'share-outline'. */
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  /** Show a spinner in place of the icon (e.g. while sharing/saving). */
  busy?: boolean;
  accessibilityLabel?: string;
};

export type AppPdfPreviewScreenProps = {
  title: string;
  /** The document HTML (already wrapped by wrapPdfHtml). */
  html?: string | null;
  /** Existing PDF file URI. When present, preview this exact exported file. */
  sourceUri?: string | null;
  onBack: () => void;
  actions?: PdfPreviewAction[];
  /** Error message — shown instead of the document. */
  error?: string | null;
  errorTitle?: string;
  /** Optional banner rendered between the header and the document. */
  banner?: React.ReactNode;
  /** Force the document to re-render (e.g. when the document/style changes). */
  webViewKey?: string | number;
};

export const AppPdfPreviewScreen: React.FC<AppPdfPreviewScreenProps> = ({
  title, html, sourceUri, onBack, actions = [], error, errorTitle, banner, webViewKey,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = safeBottom(insets.bottom);
  const [pdfError, setPdfError] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  // Measured body box. Keep the native PDF view mounted at one stable viewport
  // size for its lifetime; Android pdfium can crash below JS if the same file is
  // rapidly opened, closed, and reopened while native resources are still being
  // released.
  const [body, setBody] = useState({ w: 0, h: 0 });
  const [doc, setDoc] = useState<{ pages: number; ratio: number } | null>(null);
  const actionLocks = useRef<Record<string, boolean>>({});
  const generationSeq = useRef(0);
  const currentPdfUriRef = useRef<string | null>(null);

  // Render the document HTML to a real PDF file (the SAME generation path the
  // export/share actions use), then show it in the native PDF viewer below.
  useEffect(() => {
    let cancelled = false;
    const seq = ++generationSeq.current;
    setPdfError(false);
    setPdfUri(null);
    setDoc(null);
    if (sourceUri) {
      (async () => {
        const ok = await isReadablePdfFile(sourceUri);
        if (!cancelled) {
          if (ok) {
            setPdfUri(sourceUri);
          } else {
            setPdfError(true);
          }
        }
      })();
      return () => { cancelled = true; };
    }
    if (!html) return;
    const timer = setTimeout(() => {
      (async () => {
      try {
        void pruneTemporaryPreviewPdfs();
        // Same page size (A4) the export/share actions use, so the preview is a
        // byte-for-byte match of the file the user exports.
        const uniquePreviewName = `preview-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.pdf`;
        const uri = await printHtmlToPdfFile(html, uniquePreviewName, PAGE_SIZES.a4, { temporary: true });
        if (!cancelled && generationSeq.current === seq) setPdfUri(uri);
      } catch {
        if (!cancelled && generationSeq.current === seq) setPdfError(true);
      }
      })();
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [html, sourceUri, webViewKey]);

  // Trim the temporary preview-PDF cache when leaving any preview (the style
  // gallery churns out a new preview-*.pdf per switch). Defence-in-depth on top
  // of the prune that runs before each generation, so the cache can't accumulate
  // across visits — this is what previously bloated the cache into a crash.
  useEffect(() => () => { void pruneTemporaryPreviewPdfs(); }, []);

  useEffect(() => {
    currentPdfUriRef.current = pdfUri;
  }, [pdfUri]);

  const visibleError = error ?? (pdfError ? t('fileCenter.pdfError') : null);
  const handleActionPress = (action: PdfPreviewAction) => {
    if (action.disabled || action.busy || actionLocks.current[action.key]) return;
    actionLocks.current[action.key] = true;
    try {
      const result = action.onPress();
      Promise.resolve(result).finally(() => {
        actionLocks.current[action.key] = false;
      });
    } catch (err) {
      actionLocks.current[action.key] = false;
      throw err;
    }
  };
  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BODY} />

      {/* ── Top bar (same layout on every preview) ── */}
      <SafeAreaView edges={['top']} style={st.headerSafe}>
        <View style={st.header}>
          <TouchableOpacity
            style={st.iconBtn}
            onPress={onBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={22} color={ICON} />
          </TouchableOpacity>

          <Text style={st.title} numberOfLines={1}>{title}</Text>

          {actions.length === 0 ? (
            <View style={st.iconBtn} />
          ) : (
            actions.map(a => (
              <TouchableOpacity
                key={a.key}
                style={st.iconBtn}
                onPress={() => handleActionPress(a)}
                disabled={a.disabled || a.busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={a.accessibilityLabel}
              >
                {a.busy
                  ? <ActivityIndicator size="small" color={ICON} />
                  : <Ionicons name={a.icon} size={22} color={a.disabled ? ICON_DIM : ICON} />}
              </TouchableOpacity>
            ))
          )}
        </View>
      </SafeAreaView>

      {banner}

      {/* ── Document body ── */}
      <View
        style={st.body}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setBody(b => (b.w === width && b.h === height ? b : { w: width, h: height }));
        }}
      >
        {(() => {
          if (visibleError) {
            return (
              <View style={st.errorBox}>
                <Ionicons name="alert-circle-outline" size={28} color="#FCA5A5" />
                <Text style={st.errorTitle}>{errorTitle ?? t('fileCenter.exportPreviewFailed')}</Text>
                <Text style={st.errorMsg}>{visibleError}</Text>
              </View>
            );
          }
          // Usable height = body minus the home-indicator inset (so a scrolling
          // multi-page doc ends above it; a short doc just leaves white below).
          const availH = body.h > 0 ? Math.max(body.h - bottomInset, 0) : 0;
          const ready = !!pdfUri && body.w > 0 && availH > 0;
          if (!ready) {
            return (
              <View style={st.loading}>
                <ActivityIndicator size="large" color={colors.primaryBlue} />
                <Text style={st.loadingText}>{t('fileCenter.preparingPreview', { defaultValue: 'Preparing preview...' })}</Text>
              </View>
            );
          }
          // Fit-to-width page height on screen = bodyWidth x (pageH/pageW). Keep
          // the native Pdf itself at the exact document/viewport height so short
          // one-page PDFs stay top-aligned instead of being vertically centred by
          // native renderers. The surrounding stage fills the visible viewport in
          // white, removing the old dark bottom void without changing the PDF
          // scale, page content, export file, or share file.
          const pageRatio = doc?.ratio ?? PAGE_RATIO_A4;
          const pageCount = doc?.pages ?? 1;
          const contentH = Math.max(1, pageCount * body.w * pageRatio);
          const pdfHeight = Math.max(1, Math.min(contentH, availH));
          const stageHeight = availH;
          const renderedPdfUri = pdfUri;
          return (
            <View style={[st.pdfStage, { width: body.w, height: stageHeight }]}>
              <Pdf
                source={{ uri: pdfUri, cache: false }}
                // fitPolicy 0 = fit to width: the A4 page always fills the screen
                // width, identical on iOS and Android; pinch to zoom in for detail.
                fitPolicy={0}
                spacing={0}
                enablePaging={false}
                trustAllCerts={false}
                minScale={1}
                onLoadComplete={(numberOfPages, _path, size) => {
                  if (currentPdfUriRef.current !== renderedPdfUri) return;
                  const ratio = size && size.width ? size.height / size.width : PAGE_RATIO_A4;
                  setDoc(prev => (
                    prev && prev.pages === numberOfPages && Math.abs(prev.ratio - ratio) < 0.0001
                      ? prev
                      : { pages: numberOfPages, ratio }
                  ));
                }}
                style={[st.pdf, { width: body.w, height: pdfHeight }]}
                onError={() => {
                  if (currentPdfUriRef.current === renderedPdfUri) setPdfError(true);
                }}
              />
            </View>
          );
        })()}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  root:       { flex: 1, backgroundColor: DARK_BODY },
  headerSafe: { backgroundColor: DARK_BAR },
  header:     { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 12 },
  iconBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, textAlign: 'center', fontSize: fs(15, 13, 17), fontWeight: '700', color: '#fff' },
  // Default column flex-start means the explicitly-sized Pdf hugs the top of the
  // body. Dark body chrome makes the white PDF page boundary obvious on Android.
  body:       { flex: 1, backgroundColor: DARK_BODY, alignItems: 'center' },
  pdfStage:   { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' },
  pdf:        { backgroundColor: '#fff' },
  loading:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: fs(14, 12, 16), color: 'rgba(255,255,255,0.72)', fontWeight: '700' },
  errorBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  errorTitle: { fontSize: fs(15, 13, 17), fontWeight: '700', color: '#fff', textAlign: 'center' },
  errorMsg:   { fontSize: fs(14, 12, 16), color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 18 },
});
