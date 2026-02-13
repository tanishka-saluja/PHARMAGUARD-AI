// Expo-managed shim for tfjs-react-native optional dependency.
// We do not use bundleResourceIO, so these methods should never be called.

async function unsupported() {
  throw new Error(
    "react-native-fs is not available in Expo managed workflow. " +
      "Use tfjs-react-native HTTP asset loading paths instead."
  );
}

module.exports = {
  readFile: unsupported,
  readFileRes: unsupported,
};
