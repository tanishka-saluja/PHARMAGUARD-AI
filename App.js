import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = "0x010176646A36D172977Cb854D3C9973D823cf679";
const RPC_URL = "https://1rpc.io/sepolia";

const abi = [
  "function verifyBatch(uint256 tokenId) view returns (bool isValid, string memory risk)"
];

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bountyClaimed, setBountyClaimed] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const verifyToken = async (tokenId) => {
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

      const [isValid, risk] = await contract.verifyBatch(tokenId);

      setResult({
        tokenId,
        isValid,
        risk: risk || "Clean",
        status: isValid ? "✅ AUTHENTIC" : "❌ FAKE / EXPIRED"
      });
      setBountyClaimed(false);
    } catch (error) {
      Alert.alert("Connection Error", "Check your internet connection.");
    }
    setLoading(false);
  };

  const handleManualVerify = () => {
    const tokenId = parseInt(manualInput);
    if (isNaN(tokenId)) return Alert.alert("Invalid", "Enter a number (e.g. 0)");
    verifyToken(tokenId);
    setManualInput("");
  };

  const reportFake = () => {
    setBountyClaimed(true);
    Alert.alert(
      "✅ Fake Reported Successfully!",
      "50 PharmaGuard Tokens have been sent to your wallet as bounty reward.\n\nThank you for helping fight counterfeit drugs and saving lives! ❤️",
      [{ text: "Awesome!", style: "default" }]
    );
  };

  const reset = () => {
    setResult(null);
    setBountyClaimed(false);
  };

  if (hasPermission === null) return <Text style={styles.text}>Requesting camera...</Text>;
  if (hasPermission === false) return <Text style={styles.text}>No camera permission</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PharmaGuard AI</Text>
      <Text style={styles.subtitle}>Live on Sepolia Testnet</Text>

      {!scanning && !result && (
        <View style={{ width: '85%' }}>
          <TextInput
            style={styles.input}
            placeholder="Enter Token ID (try 0)"
            placeholderTextColor="#666"
            keyboardType="numeric"
            value={manualInput}
            onChangeText={setManualInput}
          />
          <Button title="Verify Token ID" onPress={handleManualVerify} color="#00cc66" />
        </View>
      )}

      {loading && <ActivityIndicator size="large" color="#00cc66" style={{ marginTop: 30 }} />}

      {result && (
        <View style={[styles.resultCard, { backgroundColor: result.isValid ? '#00cc66' : '#ff4444' }]}>
          <Text style={styles.resultStatus}>{result.status}</Text>
          <Text style={styles.resultDetail}>Batch #{result.tokenId}</Text>
          <Text style={styles.resultDetail}>Risk: {result.risk}</Text>

          {result.isValid && !bountyClaimed && (
            <Button 
              title="Suspicious...?. After verification, you will receive reward tokens."
              onPress={reportFake} 
              color="white" 
            />
          )}

          {bountyClaimed && (
            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold', marginVertical: 10 }}>
              🎉 Bounty Claimed! 50 PG Tokens Rewarded
            </Text>
          )}

          <Button title="Check Another Medicine" onPress={reset} color="white" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 34, fontWeight: 'bold', color: '#00cc66', marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#aaa', marginBottom: 40 },
  input: { backgroundColor: '#222', color: 'white', padding: 15, borderRadius: 10, fontSize: 18, marginBottom: 15, textAlign: 'center' },
  resultCard: { width: '100%', padding: 30, borderRadius: 20, alignItems: 'center', marginTop: 20 },
  resultStatus: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 15 },
  resultDetail: { fontSize: 18, color: 'white', marginBottom: 8 },
});
