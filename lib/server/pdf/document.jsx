import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { buildFieldToken, parseFieldTokens } from "@/lib/signing/fields";
import { renderMarkdown } from "./markdown";
import { CONTENT_WIDTH, styles } from "./theme";
import { TokenRun } from "./token_run";
import { guardText } from "./tokens";

// The signing PDF: titled A4 pages of the rendered Markdown, then one signature block per signer.

const BLOCK_INNER_WIDTH = CONTENT_WIDTH - 30;
const COLUMN_WIDTH = (BLOCK_INNER_WIDTH - 24) / 2;

const fieldToken = (type, position) => parseFieldTokens(buildFieldToken(type, position))[0];

const pageLabel = ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`;

function Footer({ title }) {
  return (
    <>
      <View fixed style={styles.footer}>
        <Text style={styles.footerTitle} maxLines={1}>
          {guardText(title)}
        </Text>
      </View>
      <Text fixed style={styles.footerPage} render={pageLabel} />
    </>
  );
}

function FieldLine({ type, position, caption, maxWidth }) {
  return (
    <View>
      <View style={styles.fieldLine}>
        <TokenRun token={fieldToken(type, position)} maxWidth={maxWidth} />
      </View>
      <Text style={styles.fieldCaption}>{caption}</Text>
    </View>
  );
}

// Kept on one page: label, signature line, name and date fields, then the signer's printed name and email.
function SignatureBlock({ signer }) {
  const { position, name, email } = signer;
  return (
    <View wrap={false} style={styles.signatureBlock}>
      <Text style={styles.recipientLabel}>{`Recipient ${position}`}</Text>
      <FieldLine type="signature" position={position} caption="Signature" maxWidth={BLOCK_INNER_WIDTH} />
      <View style={styles.fieldRow}>
        <View style={styles.fieldColumn}>
          <FieldLine type="name" position={position} caption="Full name" maxWidth={COLUMN_WIDTH} />
        </View>
        <View style={styles.fieldGap} />
        <View style={styles.fieldColumn}>
          <FieldLine type="date" position={position} caption="Date signed" maxWidth={COLUMN_WIDTH} />
        </View>
      </View>
      {name ? <Text style={styles.signerName}>{guardText(name)}</Text> : null}
      {email ? <Text style={styles.signerEmail}>{guardText(email)}</Text> : null}
    </View>
  );
}

export function DocumentPdf({ title, body, signers }) {
  return (
    <Document title={title} author="Geiger Docs" creator="Geiger Docs" producer="Geiger Docs">
      <Page size="A4" style={styles.page}>
        <Footer title={title} />
        <Text style={styles.title}>{guardText(title)}</Text>
        <View style={styles.titleRule} />
        {renderMarkdown(body)}
      </Page>
      {signers.length ? (
        <Page size="A4" style={styles.page}>
          <Footer title={title} />
          <Text style={styles.signaturesHeading}>Signatures</Text>
          <Text style={styles.signaturesIntro}>Each signer completes the fields in their block below.</Text>
          {signers.map((signer, index) => (
            <SignatureBlock key={`${signer.position}-${index}`} signer={signer} />
          ))}
        </Page>
      ) : null}
    </Document>
  );
}
