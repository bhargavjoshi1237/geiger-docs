import "server-only";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./theme";
import { tokenLayout } from "./tokens";

// A whole token never hyphenates; its fixed-width text box always fits it on one line.
const keepWhole = (word) => [word];

// One field token as its own unbreakable box (Documenso detects the text and replaces it with the field).
export function TokenRun({ token, maxWidth, marginRight = 0 }) {
  const layout = tokenLayout(token, maxWidth);
  return (
    <View wrap={false} style={{ ...styles.tokenBox, marginRight }}>
      <Text
        hyphenationCallback={keepWhole}
        style={{
          ...styles.token,
          fontFamily: layout.fontFamily,
          fontSize: layout.fontSize,
          width: layout.width,
        }}
      >
        {layout.text}
      </Text>
    </View>
  );
}
