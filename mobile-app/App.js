import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { ethers } from "ethers";
import {
  classifyImageUri,
  initMobileNet,
  scoreMobileNetRisk,
} from "./services/mobileNetService";
import { awarenessPosts } from "./content/awarenessPosts";

const CONTRACT_ADDRESS =
  process.env.EXPO_PUBLIC_PHARMA_CONTRACT_ADDRESS || "0x010176646A36D172977Cb854D3C9973D823cf679";
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const AWARENESS_FEED_URL = process.env.EXPO_PUBLIC_AWARENESS_FEED_URL || "";

const CACHE_KEY = "pharmaguard_verification_cache_v3";
const REPORT_QUEUE_KEY = "pharmaguard_report_queue_v3";
const AWARENESS_FEED_CACHE_KEY = "pharmaguard_awareness_feed_v1";

const ABI = [
  "function verifyBatch(uint256 tokenId) view returns (bool isValid, string risk)",
  "function getBatchCompliance(uint256 tokenId) view returns (string productName, string manufacturerName, string manufacturerLicenseNo, string batchNumber, uint64 mfgDate, uint64 expiryTimestamp, string apiHash, bytes32 packagingHash, bool quarantined, bool flaggedHighRisk)",
  "function getHighRiskBatchIds(uint256 cursor, uint256 limit) view returns (uint256[] ids, uint256 nextCursor)",
  "function getDashboardSummary() view returns (uint256 minted, uint256 reportsFiled, uint256 openReports, uint256 highRiskBatches, uint256 confirmedFakeReports, uint256 poolBalanceWei)",
  "function reporterProfiles(address reporter) view returns (int256 reputation, uint32 reportsSubmitted, uint32 reportsConfirmed, uint32 reportsRejected, uint32 openReports, uint64 lastReportAt, bool blocked)",
];

const FONTS = {
  heading: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium", default: "sans-serif" }),
  body: Platform.select({ ios: "Avenir Next", android: "sans-serif", default: "sans-serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

const OUTCOME_TO_LABEL = {
  authentic: "Likely Authentic",
  review: "Needs Review",
  counterfeit: "Potential Counterfeit",
  unknown: "Unverified / Not Found",
};

const OUTCOME_TO_SEVERITY = {
  authentic: 1,
  review: 2,
  counterfeit: 3,
  unknown: 2,
};

const OUTCOME_TO_EXPLANATION = {
  authentic:
    "This batch passed on-chain verification and has a valid compliance footprint on the selected network.",
  review:
    "Signals are inconclusive. Continue with manual checks and escalate if packaging, source, or behavior looks suspicious.",
  counterfeit:
    "High-risk indicators were detected. Treat as potentially counterfeit until regulator or lab review is complete.",
  unknown:
    "No reliable verification data was found for this token on the selected network.",
};

const OUTCOME_TO_NEXT_ACTION = {
  authentic: "Record and continue distribution checks. Re-verify if supply chain context changes.",
  review: "Queue a report with evidence and prioritize inspection before patient-facing distribution.",
  counterfeit: "Quarantine stock immediately and escalate to regulator/lab workflow.",
  unknown: "Confirm network and token ID, then retry. If still unknown, queue for manual investigation.",
};

const SOURCE_TO_LABEL = {
  "on-chain": "Blockchain verified",
  "offline-mobile-net": "Offline AI advisory",
  "offline-heuristic": "Offline manual heuristic",
  "offline-cache": "Cached verification",
  "network-mismatch-or-unknown-token": "Unknown token / wrong network",
};

function mapMobileNetToOfflineOutcome(mobileNet) {
  if (!mobileNet) {
    return "";
  }

  const outcome = String(mobileNet?.outcome || "").toLowerCase();
  const status = String(mobileNet?.status || "").toLowerCase();
  const risk = String(mobileNet?.risk || "").toLowerCase();

  if (outcome === "counterfeit" || status.includes("counterfeit") || risk.includes("mismatch")) {
    return "counterfeit";
  }

  // AI-only inference is advisory; it should not independently mark a batch as authentic.
  return "review";
}

function formatSourceLabel(source) {
  const value = String(source || "");
  return SOURCE_TO_LABEL[value] || value.replaceAll("-", " ");
}

function getNetworkLabel(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("sepolia")) return "Ethereum Sepolia";
  if (value.includes("amoy")) return "Polygon Amoy";
  if (value.includes("polygon-rpc.com") || value.includes("polygon")) return "Polygon";
  return "Custom RPC";
}

function formatUnix(unixTs) {
  const ts = Number(unixTs || 0);
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function normalizeAwarenessPost(post, fallbackId) {
  const details = Array.isArray(post?.details)
    ? post.details.map((line) => String(line)).filter((line) => line.trim().length > 0)
    : [];

  const tags = Array.isArray(post?.tags)
    ? post.tags.map((tag) => String(tag)).filter((tag) => tag.trim().length > 0)
    : [];

  return {
    id: String(post?.id || `awareness-${fallbackId}`),
    title: String(post?.title || "Public safety update"),
    summary: String(post?.summary || "Safety advisory for medicine verification."),
    details,
    action: String(post?.action || "Verify batch details and report suspicious medicines."),
    emergency: Boolean(post?.emergency),
    tags: tags.slice(0, 6),
    publishedAt: String(post?.publishedAt || new Date().toISOString()),
  };
}

function sortAwarenessPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.emergency !== b.emergency) {
      return a.emergency ? -1 : 1;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function deriveOutcomeFromRisk(isValid, riskText) {
  const risk = String(riskText || "").toLowerCase();

  if (!isValid) {
    if (risk.includes("high-risk") || risk.includes("quarantine") || risk.includes("expired")) {
      return "counterfeit";
    }
    return "review";
  }

  if (risk.includes("under investigation") || risk.includes("under review") || risk.includes("no model")) {
    return "review";
  }

  return "authentic";
}

function buildOfflineAssessment(packagingNotes) {
  const notes = (packagingNotes || "").toLowerCase();
  const suspiciousTerms = [
    "tamper",
    "broken",
    "smudge",
    "blur",
    "mismatch",
    "spelling",
    "seal",
    "fake",
    "hologram",
  ];

  const score = suspiciousTerms.reduce((sum, term) => sum + (notes.includes(term) ? 1 : 0), 0);

  if (score >= 4) {
    return {
      isValid: false,
      outcome: "counterfeit",
      risk: "Offline AI: strong anomaly indicators",
      status: OUTCOME_TO_LABEL.counterfeit,
      suggestedSeverity: 3,
    };
  }

  if (score >= 2) {
    return {
      isValid: true,
      outcome: "review",
      risk: "Offline AI: anomaly clues found, verify urgently",
      status: OUTCOME_TO_LABEL.review,
      suggestedSeverity: 2,
    };
  }

  if (score === 0 && !notes.trim()) {
    return {
      isValid: false,
      outcome: "unknown",
      risk: "No on-chain data and no offline evidence provided",
      status: OUTCOME_TO_LABEL.unknown,
      suggestedSeverity: 2,
    };
  }

  return {
    isValid: true,
    outcome: "review",
    risk: "Offline AI: low anomaly but insufficient proof",
    status: OUTCOME_TO_LABEL.review,
    suggestedSeverity: 2,
  };
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function ActionButton({ label, onPress, variant = "primary", disabled = false, compact = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        styles[`actionButton_${variant}`],
        compact ? styles.actionButtonCompact : null,
        pressed ? { transform: [{ scale: 0.98 }], opacity: 0.95 } : null,
        disabled ? styles.actionButtonDisabled : null,
      ]}
    >
      <Text style={[styles.actionButtonText, styles[`actionButtonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ outcome, text }) {
  return (
    <View style={[styles.statusPill, styles[`statusPill_${outcome}`]]}>
      <Text style={[styles.statusPillText, styles[`statusPillText_${outcome}`]]}>{text}</Text>
    </View>
  );
}

export default function App() {
  const [manualInput, setManualInput] = useState("0");
  const [packagingNotes, setPackagingNotes] = useState("");
  const [severityInput, setSeverityInput] = useState("2");
  const [reporterAddress, setReporterAddress] = useState("");

  const [result, setResult] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [reporterProfile, setReporterProfile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [reporterLoading, setReporterLoading] = useState(false);

  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [highRiskBatches, setHighRiskBatches] = useState([]);
  const [queuedReports, setQueuedReports] = useState([]);

  const [mobileNetReady, setMobileNetReady] = useState(false);
  const [mobileNetBootError, setMobileNetBootError] = useState("");
  const [mobileNetLoading, setMobileNetLoading] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState("");
  const [mobileNetResult, setMobileNetResult] = useState(null);
  const [mobileNetPredictions, setMobileNetPredictions] = useState([]);

  const [openAwarenessId, setOpenAwarenessId] = useState("");
  const [awarenessFeed, setAwarenessFeed] = useState(
    sortAwarenessPosts(awarenessPosts.map((post, idx) => normalizeAwarenessPost(post, idx)))
  );
  const [awarenessSource, setAwarenessSource] = useState("local");
  const [awarenessUpdatedAt, setAwarenessUpdatedAt] = useState("");
  const [awarenessLoading, setAwarenessLoading] = useState(false);
  const [consoleMode, setConsoleMode] = useState("citizen-enterprise");

  const networkLabel = useMemo(() => getNetworkLabel(RPC_URL), []);
  const provider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);
  const contract = useMemo(() => new ethers.Contract(CONTRACT_ADDRESS, ABI, provider), [provider]);

  useEffect(() => {
    loadQueue();
    refreshGovernmentDashboard();
    loadAwarenessFeed();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await initMobileNet();
        if (mounted) {
          setMobileNetReady(true);
        }
      } catch {
        if (mounted) {
          setMobileNetBootError("Model initialization failed. Check TensorFlow setup.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const loadQueue = async () => {
    const queue = await readJson(REPORT_QUEUE_KEY, []);
    setQueuedReports(queue);
  };

  const loadAwarenessFeed = async () => {
    setAwarenessLoading(true);
    const fallback = sortAwarenessPosts(
      awarenessPosts.map((post, idx) => normalizeAwarenessPost(post, idx))
    );

    try {
      if (!AWARENESS_FEED_URL) {
        throw new Error("Feed URL not configured");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(AWARENESS_FEED_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Feed HTTP ${response.status}`);
      }

      const payload = await response.json();
      const rawPosts = Array.isArray(payload) ? payload : Array.isArray(payload.posts) ? payload.posts : [];
      const normalized = sortAwarenessPosts(
        rawPosts.map((post, idx) => normalizeAwarenessPost(post, idx))
      );

      if (!normalized.length) {
        throw new Error("Feed empty");
      }

      const updatedAt = String(payload?.updatedAt || new Date().toISOString());
      setAwarenessFeed(normalized);
      setAwarenessSource("server");
      setAwarenessUpdatedAt(updatedAt);

      await writeJson(AWARENESS_FEED_CACHE_KEY, {
        posts: normalized,
        updatedAt,
        source: "server",
      });
    } catch {
      const cached = await readJson(AWARENESS_FEED_CACHE_KEY, null);
      if (cached?.posts?.length) {
        setAwarenessFeed(sortAwarenessPosts(cached.posts));
        setAwarenessSource("cache");
        setAwarenessUpdatedAt(String(cached.updatedAt || ""));
      } else {
        setAwarenessFeed(fallback);
        setAwarenessSource("local");
        setAwarenessUpdatedAt("");
      }
    }

    setAwarenessLoading(false);
  };

  const refreshGovernmentDashboard = async () => {
    setDashboardLoading(true);
    try {
      const summary = await contract.getDashboardSummary();
      const highRiskResp = await contract.getHighRiskBatchIds(0, 20);

      setDashboardSummary({
        minted: Number(summary[0]),
        reportsFiled: Number(summary[1]),
        openReports: Number(summary[2]),
        highRiskBatches: Number(summary[3]),
        confirmedFakeReports: Number(summary[4]),
        poolBalanceWei: summary[5].toString(),
      });

      setHighRiskBatches((highRiskResp[0] || []).map((x) => Number(x)));
    } catch {
      setDashboardSummary(null);
      setHighRiskBatches([]);
    }
    setDashboardLoading(false);
  };

  const fetchReporterProfile = async () => {
    if (!ethers.isAddress(reporterAddress)) {
      Alert.alert("Invalid address", "Enter a valid EVM address.");
      return;
    }

    setReporterLoading(true);
    try {
      const profile = await contract.reporterProfiles(reporterAddress);
      setReporterProfile({
        reputation: Number(profile[0]),
        reportsSubmitted: Number(profile[1]),
        reportsConfirmed: Number(profile[2]),
        reportsRejected: Number(profile[3]),
        openReports: Number(profile[4]),
        lastReportAt: Number(profile[5]),
        blocked: Boolean(profile[6]),
      });
    } catch {
      setReporterProfile(null);
      Alert.alert("Lookup failed", "Could not fetch reporter profile on selected network.");
    }
    setReporterLoading(false);
  };

  const verifyToken = async (tokenId) => {
    setLoading(true);

    try {
      const [isValid, risk] = await contract.verifyBatch(tokenId);
      const complianceData = await contract.getBatchCompliance(tokenId);
      const hasComplianceFootprint =
        Boolean(String(complianceData[0] || "").trim()) ||
        Boolean(String(complianceData[3] || "").trim()) ||
        Number(complianceData[4]) > 0 ||
        Number(complianceData[5]) > 0;

      let outcome = deriveOutcomeFromRisk(isValid, risk);
      if (outcome === "authentic" && !hasComplianceFootprint) {
        outcome = "unknown";
      }

      const freshResult = {
        tokenId,
        isValid: outcome === "authentic",
        outcome,
        risk:
          outcome === "unknown"
            ? "Token has no compliance footprint on selected network"
            : risk || "Clean",
        status: OUTCOME_TO_LABEL[outcome],
        source: "on-chain",
        suggestedSeverity: OUTCOME_TO_SEVERITY[outcome],
      };

      const compliancePayload = {
        productName: complianceData[0],
        manufacturerName: complianceData[1],
        manufacturerLicenseNo: complianceData[2],
        batchNumber: complianceData[3],
        mfgDate: Number(complianceData[4]),
        expiryTimestamp: Number(complianceData[5]),
        apiHash: complianceData[6],
        packagingHash: complianceData[7],
        quarantined: Boolean(complianceData[8]),
        flaggedHighRisk: Boolean(complianceData[9]),
      };

      setResult(freshResult);
      setCompliance(compliancePayload);

      const cache = await readJson(CACHE_KEY, {});
      cache[String(tokenId)] = { result: freshResult, compliance: compliancePayload };
      await writeJson(CACHE_KEY, cache);
    } catch (error) {
      const errorText = String(error?.message || "").toLowerCase();
      const cache = await readJson(CACHE_KEY, {});
      const cached = cache[String(tokenId)];

      if (cached) {
        const cachedOutcome = cached.result?.outcome === "counterfeit" ? "counterfeit" : "review";
        setResult({
          ...cached.result,
          isValid: false,
          outcome: cachedOutcome,
          risk: `${cached.result?.risk || "Cached verification loaded"} (re-verify online)`,
          status: OUTCOME_TO_LABEL[cachedOutcome],
          source: "offline-cache",
          suggestedSeverity: OUTCOME_TO_SEVERITY[cachedOutcome],
        });
        setCompliance(cached.compliance || null);
      } else if (errorText.includes("unknown batch") || errorText.includes("execution reverted")) {
        setResult({
          tokenId,
          isValid: false,
          outcome: "unknown",
          risk: "Token not found on selected network",
          status: OUTCOME_TO_LABEL.unknown,
          source: "network-mismatch-or-unknown-token",
          suggestedSeverity: 2,
        });
        setCompliance(null);
      } else if (mobileNetResult) {
        const offlineOutcome = mapMobileNetToOfflineOutcome(mobileNetResult);
        setResult({
          tokenId,
          isValid: false,
          outcome: offlineOutcome,
          risk: mobileNetResult.risk,
          status: OUTCOME_TO_LABEL[offlineOutcome],
          source: "offline-mobile-net",
          suggestedSeverity: mobileNetResult.suggestedSeverity || OUTCOME_TO_SEVERITY[offlineOutcome],
        });
        setCompliance(null);
      } else {
        const ai = buildOfflineAssessment(packagingNotes);
        setResult({ tokenId, ...ai, source: "offline-heuristic" });
        setCompliance(null);
      }
    }

    setLoading(false);
  };

  const handleManualVerify = () => {
    const tokenId = parseInt(manualInput, 10);
    if (Number.isNaN(tokenId)) {
      Alert.alert("Invalid Token", "Enter a numeric token id.");
      return;
    }

    verifyToken(tokenId);
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Media permission is needed for image inference.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!picked.canceled && picked.assets?.[0]?.uri) {
      setSelectedImageUri(picked.assets[0].uri);
      setMobileNetResult(null);
      setMobileNetPredictions([]);
    }
  };

  const captureWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Camera permission is needed for image inference.");
      return;
    }

    const captured = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1,
    });

    if (!captured.canceled && captured.assets?.[0]?.uri) {
      setSelectedImageUri(captured.assets[0].uri);
      setMobileNetResult(null);
      setMobileNetPredictions([]);
    }
  };

  const runMobileNetInference = async () => {
    if (!selectedImageUri) {
      Alert.alert("No image", "Select or capture a packaging image first.");
      return;
    }

    setMobileNetLoading(true);
    try {
      const predictions = await classifyImageUri(selectedImageUri);
      setMobileNetPredictions(predictions.slice(0, 3));

      const scored = scoreMobileNetRisk(predictions);
      setMobileNetResult(scored);

      if (!packagingNotes) {
        setPackagingNotes(`MobileNet: ${scored.risk}`);
      }
    } catch {
      Alert.alert("Inference error", "MobileNet inference failed. Check model and permissions.");
    }

    setMobileNetLoading(false);
  };

  const queueFakeReport = async () => {
    const parsedToken = parseInt(manualInput, 10);
    const tokenId = result?.tokenId ?? (Number.isNaN(parsedToken) ? null : parsedToken);

    if (tokenId === null) {
      Alert.alert("Token required", "Enter or verify a token id before queueing report.");
      return;
    }

    const parsedSeverity = parseInt(severityInput || "0", 10);
    const fallbackOutcome = result?.outcome || mapMobileNetToOfflineOutcome(mobileNetResult) || "unknown";
    const fallbackSeverity = OUTCOME_TO_SEVERITY[fallbackOutcome] || 2;

    const severity = [1, 2, 3].includes(parsedSeverity) ? parsedSeverity : fallbackSeverity;

    const queuedItem = {
      tokenId,
      reason:
        packagingNotes ||
        result?.risk ||
        mobileNetResult?.risk ||
        "Suspicious packaging. Needs verification.",
      severity,
      aadhaarSimId: "device-nullifier-base",
      evidenceURI: "ipfs://pending-upload",
      nonce: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      source:
        result?.source ||
        (mobileNetResult ? "mobile-net-on-device" : "manual"),
      ai: mobileNetResult
        ? {
            outcome: mapMobileNetToOfflineOutcome(mobileNetResult),
            status: mobileNetResult.status,
            confidence: mobileNetResult.confidence,
            topClass: mobileNetResult.topClass,
          }
        : null,
    };

    const queue = await readJson(REPORT_QUEUE_KEY, []);
    queue.push(queuedItem);
    await writeJson(REPORT_QUEUE_KEY, queue);
    setQueuedReports(queue);

    Alert.alert(
      "Report queued",
      "Saved for secure on-chain submission via scripts/submitQueuedReports.js"
    );
  };

  const clearQueue = async () => {
    await writeJson(REPORT_QUEUE_KEY, []);
    setQueuedReports([]);
  };

  const toggleAwareness = (id) => {
    setOpenAwarenessId((current) => (current === id ? "" : id));
  };

  const reset = () => {
    setResult(null);
    setCompliance(null);
    setPackagingNotes("");
    setSeverityInput("2");
    setSelectedImageUri("");
    setMobileNetResult(null);
    setMobileNetPredictions([]);
  };

  const resultOutcome = result?.outcome || "unknown";
  const resultExplanation = result ? OUTCOME_TO_EXPLANATION[resultOutcome] : "";
  const resultNextAction = result ? OUTCOME_TO_NEXT_ACTION[resultOutcome] : "";
  const mintedCount = Number(dashboardSummary?.minted || 0);
  const tokenRangeHint = dashboardSummary
    ? mintedCount > 0
      ? `Available token IDs on this contract: 0 to ${mintedCount - 1} (${mintedCount} total).`
      : "No batches are minted yet on this contract/network."
    : "Dashboard unavailable. Confirm network and contract address.";
  const isGovernmentMode = consoleMode === "government";
  const consoleTitle = isGovernmentMode
    ? "PharmaGuard Government Console"
    : "PharmaGuard Citizen & Enterprise Console";
  const consoleSubtitle = isGovernmentMode
    ? "Regulatory oversight, abuse prevention, and high-risk monitoring."
    : "Field verification, packaging AI checks, and citizen awareness.";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.bgOrbOne} />
      <View style={styles.bgOrbTwo} />

      <View style={styles.heroCard}>
        <Text style={styles.title}>{consoleTitle}</Text>
        <Text style={styles.subtitle}>{consoleSubtitle}</Text>

        <View style={styles.heroMetaRow}>
          <StatusPill outcome="review" text={networkLabel} />
          <StatusPill outcome="review" text={isGovernmentMode ? "Government Mode" : "Citizen/Enterprise Mode"} />
          <StatusPill
            outcome={isGovernmentMode ? "review" : mobileNetReady ? "authentic" : "unknown"}
            text={isGovernmentMode ? `Open reports ${dashboardSummary?.openReports ?? "-"}` : `Queue ${queuedReports.length}`}
          />
        </View>
      </View>

      <View style={styles.modeCard}>
        <Text style={styles.modeTitle}>Console Access</Text>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setConsoleMode("citizen-enterprise")}
            style={[
              styles.modeOption,
              consoleMode === "citizen-enterprise" ? styles.modeOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeOptionText,
                consoleMode === "citizen-enterprise" ? styles.modeOptionTextActive : null,
              ]}
            >
              Citizen / Enterprise
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setConsoleMode("government")}
            style={[styles.modeOption, consoleMode === "government" ? styles.modeOptionActive : null]}
          >
            <Text
              style={[styles.modeOptionText, consoleMode === "government" ? styles.modeOptionTextActive : null]}
            >
              Government
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>Decision Guide</Text>
        <View style={styles.legendRow}>
          <StatusPill outcome="authentic" text="Green: on-chain verified" />
          <StatusPill outcome="review" text="Amber: needs investigation" />
          <StatusPill outcome="counterfeit" text="Red: quarantine now" />
        </View>
        <Text style={styles.legendHint}>
          AI-only checks are advisory and will not auto-mark a batch as authentic.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Batch Verification</Text>
        <Text style={styles.sectionHint}>
          Enter token ID first. Green appears only after blockchain verification with compliance data.
        </Text>
        <Text style={styles.sectionHintStrong}>{tokenRangeHint}</Text>

        <Text style={styles.fieldLabel}>Token ID</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 0"
          placeholderTextColor="#6d7c95"
          keyboardType="numeric"
          value={manualInput}
          onChangeText={setManualInput}
        />

        <Text style={styles.fieldLabel}>Packaging observations (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="seal mismatch, blur print, odd smell, label issues"
          placeholderTextColor="#6d7c95"
          multiline
          value={packagingNotes}
          onChangeText={setPackagingNotes}
        />

        <Text style={styles.fieldLabel}>Severity for queued report (1 low, 3 high)</Text>
        <TextInput
          style={styles.input}
          placeholder="2"
          placeholderTextColor="#6d7c95"
          keyboardType="numeric"
          value={severityInput}
          onChangeText={setSeverityInput}
        />

        <View style={styles.rowButtons}>
          <ActionButton label="Verify Token" onPress={handleManualVerify} variant="primary" />
          <ActionButton label="Save Suspicious Report" onPress={queueFakeReport} variant="secondary" />
        </View>

        {loading ? <ActivityIndicator size="small" color="#1fd06f" style={styles.loader} /> : null}
      </View>

      {!isGovernmentMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>On-device AI (MobileNet)</Text>
          <Text style={styles.sectionHint}>
            Use image AI when packaging looks suspicious. This is advisory and supports escalation.
          </Text>

          {!!mobileNetBootError ? <Text style={styles.warnLine}>{mobileNetBootError}</Text> : null}

          <View style={styles.rowButtons}>
            <ActionButton label="Select Image" onPress={pickFromGallery} variant="neutral" />
            <ActionButton label="Capture" onPress={captureWithCamera} variant="neutral" />
          </View>
          <View style={styles.rowButtonsSingle}>
            <ActionButton
              label={mobileNetLoading ? "Analyzing..." : "Analyze Packaging with AI"}
              onPress={runMobileNetInference}
              variant="primary"
              disabled={!selectedImageUri || mobileNetLoading}
            />
          </View>

          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={styles.previewImage} resizeMode="cover" />
          ) : null}

          {mobileNetLoading ? <ActivityIndicator size="small" color="#1fd06f" style={styles.loader} /> : null}

          {mobileNetResult ? (
            <View style={styles.aiResultCard}>
              <StatusPill
                outcome={mapMobileNetToOfflineOutcome(mobileNetResult)}
                text={OUTCOME_TO_LABEL[mapMobileNetToOfflineOutcome(mobileNetResult)]}
              />
              <Text style={styles.resultLine}>AI verdict: {mobileNetResult.status || "Review required"}</Text>
              <Text style={styles.resultLine}>AI risk: {mobileNetResult.risk}</Text>
              <Text style={styles.resultLine}>Confidence: {Number(mobileNetResult.confidence || 0).toFixed(3)}</Text>
              <Text style={styles.resultLine}>Suggested severity: {mobileNetResult.suggestedSeverity}</Text>

              {mobileNetPredictions.length ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.sectionSubTitle}>Top predictions</Text>
                  {mobileNetPredictions.map((p, idx) => (
                    <Text key={`${p.className}-${idx}`} style={styles.resultLineSmall}>
                      {idx + 1}. {p.className} ({Number(p.probability || 0).toFixed(3)})
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <View style={[styles.card, styles.resultCard, styles[`resultCard_${result.outcome || "unknown"}`]]}>
          <View style={styles.resultTopRow}>
            <Text style={styles.resultTitle}>{result.status}</Text>
            <StatusPill outcome={result.outcome || "unknown"} text={formatSourceLabel(result.source)} />
          </View>
          <Text style={styles.resultLine}>Batch: #{result.tokenId}</Text>
          <Text style={styles.resultLine}>Risk: {result.risk}</Text>
          <Text style={styles.resultLine}>Suggested severity: {result.suggestedSeverity || 2}</Text>
          <Text style={styles.resultMetaLabel}>What this means</Text>
          <Text style={styles.resultExplain}>{resultExplanation}</Text>
          <Text style={styles.resultMetaLabel}>Recommended next action</Text>
          <Text style={styles.resultExplain}>{resultNextAction}</Text>
          <ActionButton label="Reset Result" onPress={reset} variant="neutral" compact />
        </View>
      ) : null}

      {compliance ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Compliance Snapshot</Text>
          <Text style={styles.resultLine}>Product: {compliance.productName}</Text>
          <Text style={styles.resultLine}>Batch: {compliance.batchNumber}</Text>
          <Text style={styles.resultLine}>Manufacturer: {compliance.manufacturerName}</Text>
          <Text style={styles.resultLine}>License: {compliance.manufacturerLicenseNo}</Text>
          <Text style={styles.resultLine}>Mfg date: {formatUnix(compliance.mfgDate)}</Text>
          <Text style={styles.resultLine}>Expiry: {formatUnix(compliance.expiryTimestamp)}</Text>
          <Text style={styles.resultLine}>Quarantined: {String(compliance.quarantined)}</Text>
          <Text style={styles.resultLine}>High-risk: {String(compliance.flaggedHighRisk)}</Text>
        </View>
      ) : null}

      {!isGovernmentMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Public Awareness Feed</Text>
          <View style={styles.feedMetaRow}>
            <Text style={styles.feedMetaText}>Source: {awarenessSource}</Text>
            <Text style={styles.feedMetaText}>
              Updated: {awarenessUpdatedAt ? new Date(awarenessUpdatedAt).toLocaleString() : "n/a"}
            </Text>
          </View>
          <ActionButton
            label={awarenessLoading ? "Refreshing..." : "Refresh Feed"}
            onPress={loadAwarenessFeed}
            variant="primary"
            disabled={awarenessLoading}
            compact
          />

          {awarenessFeed.map((post) => {
            const isOpen = openAwarenessId === post.id;
            return (
              <View key={post.id} style={[styles.blogCard, post.emergency ? styles.blogEmergencyCard : null]}>
                <View style={styles.blogHeaderRow}>
                  <Text style={styles.blogTitle}>{post.title}</Text>
                  {post.emergency ? <Text style={styles.blogBadge}>EMERGENCY</Text> : null}
                </View>
                <Text style={styles.blogSummary}>{post.summary}</Text>
                {post.tags?.length ? <Text style={styles.blogTags}>Tags: {post.tags.join(", ")}</Text> : null}
                <ActionButton
                  label={isOpen ? "Hide details" : "Read details"}
                  onPress={() => toggleAwareness(post.id)}
                  variant="secondary"
                  compact
                />

                {isOpen ? (
                  <View style={styles.blogBody}>
                    {post.details.map((line, idx) => (
                      <Text key={`${post.id}-${idx}`} style={styles.blogBullet}>
                        {"\u2022"} {line}
                      </Text>
                    ))}
                    <Text style={styles.blogAction}>Action: {post.action}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {!isGovernmentMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Citizen Queue</Text>
          <Text style={styles.resultLine}>Queued reports: {queuedReports.length}</Text>
          <Text style={styles.sectionHint}>Submit via scripts/submitQueuedReports.js with REPORT_QUEUE_PATH.</Text>

          <View style={styles.rowButtons}>
            <ActionButton label="Clear Queue" onPress={clearQueue} variant="danger" compact />
          </View>
        </View>
      ) : null}

      {isGovernmentMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reporter Profile Check</Text>
          <TextInput
            style={styles.input}
            placeholder="Reporter wallet address"
            placeholderTextColor="#6d7c95"
            value={reporterAddress}
            onChangeText={setReporterAddress}
            autoCapitalize="none"
          />
          <ActionButton label="Fetch Reporter Profile" onPress={fetchReporterProfile} variant="primary" compact />

          {reporterLoading ? <ActivityIndicator size="small" color="#1fd06f" style={styles.loader} /> : null}

          {reporterProfile ? (
            <View style={styles.reporterCard}>
              <Text style={styles.resultLine}>Reputation: {reporterProfile.reputation}</Text>
              <Text style={styles.resultLine}>Submitted: {reporterProfile.reportsSubmitted}</Text>
              <Text style={styles.resultLine}>Confirmed: {reporterProfile.reportsConfirmed}</Text>
              <Text style={styles.resultLine}>Rejected: {reporterProfile.reportsRejected}</Text>
              <Text style={styles.resultLine}>Open reports: {reporterProfile.openReports}</Text>
              <Text style={styles.resultLine}>Blocked: {String(reporterProfile.blocked)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isGovernmentMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Government Dashboard</Text>
          {dashboardLoading ? (
            <ActivityIndicator size="small" color="#1fd06f" />
          ) : dashboardSummary ? (
            <View style={styles.metricsGrid}>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Minted</Text>
                <Text style={styles.metricValue}>{dashboardSummary.minted}</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Reports</Text>
                <Text style={styles.metricValue}>{dashboardSummary.reportsFiled}</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Open</Text>
                <Text style={styles.metricValue}>{dashboardSummary.openReports}</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>High-risk</Text>
                <Text style={styles.metricValue}>{dashboardSummary.highRiskBatches}</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Confirmed fake</Text>
                <Text style={styles.metricValue}>{dashboardSummary.confirmedFakeReports}</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Pool (wei)</Text>
                <Text style={[styles.metricValue, styles.metricMonoValue]}>
                  {dashboardSummary.poolBalanceWei}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.resultLine}>Dashboard data unavailable for current network.</Text>
          )}

          <Text style={styles.sectionHint}>
            High-risk token IDs: {highRiskBatches.length ? highRiskBatches.join(", ") : "None"}
          </Text>
          <ActionButton label="Refresh Dashboard" onPress={refreshGovernmentDashboard} variant="primary" compact />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#070B14",
  },
  container: {
    padding: 18,
    paddingBottom: 40,
    gap: 12,
  },
  bgOrbOne: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(74,165,255,0.12)",
  },
  bgOrbTwo: {
    position: "absolute",
    top: 120,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(35,193,107,0.08)",
  },
  heroCard: {
    backgroundColor: "#10192B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A3A58",
    padding: 16,
  },
  title: {
    fontSize: 31,
    lineHeight: 36,
    fontFamily: FONTS.heading,
    color: "#E9F1FB",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: "#A8B9D4",
    fontFamily: FONTS.body,
  },
  heroMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendCard: {
    backgroundColor: "#0F1B2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2D4268",
    padding: 14,
    gap: 8,
  },
  legendTitle: {
    fontSize: 16,
    fontFamily: FONTS.heading,
    color: "#EAF2FF",
    fontWeight: "700",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendHint: {
    color: "#9FB2D2",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  modeCard: {
    backgroundColor: "#0F1A2B",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A3C5D",
    padding: 14,
    gap: 10,
  },
  modeTitle: {
    fontSize: 16,
    fontFamily: FONTS.heading,
    color: "#EAF2FF",
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#344C74",
    backgroundColor: "#15233A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  modeOptionActive: {
    borderColor: "#4AA6FF",
    backgroundColor: "#1A3558",
  },
  modeOptionText: {
    color: "#BDD0EE",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONTS.body,
    textAlign: "center",
  },
  modeOptionTextActive: {
    color: "#ECF5FF",
  },
  card: {
    backgroundColor: "#0F1626",
    borderRadius: 16,
    borderColor: "#24344F",
    borderWidth: 1,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: FONTS.heading,
    color: "#EEF3FC",
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSubTitle: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: "#D3DDEE",
    marginBottom: 6,
    fontWeight: "600",
  },
  sectionHint: {
    fontSize: 13,
    color: "#8FA0BC",
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: FONTS.body,
  },
  sectionHintStrong: {
    fontSize: 13,
    color: "#D7E5FB",
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: FONTS.body,
    fontWeight: "700",
  },
  fieldLabel: {
    color: "#AFC0DB",
    fontSize: 12,
    marginBottom: 6,
    fontFamily: FONTS.body,
  },
  input: {
    backgroundColor: "#121D30",
    color: "#F0F5FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    borderColor: "#2A3C5C",
    borderWidth: 1,
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  rowButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  rowButtonsSingle: {
    marginTop: 10,
  },
  actionButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    flex: 1,
  },
  actionButtonCompact: {
    minHeight: 40,
    paddingVertical: 9,
  },
  actionButton_primary: {
    backgroundColor: "#1E6EFF",
    borderColor: "#4A9EFF",
  },
  actionButton_secondary: {
    backgroundColor: "#1A8D57",
    borderColor: "#35C980",
  },
  actionButton_neutral: {
    backgroundColor: "#1A2438",
    borderColor: "#334A71",
  },
  actionButton_danger: {
    backgroundColor: "#3A1A1E",
    borderColor: "#8D3D47",
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: "700",
  },
  actionButtonText_primary: {
    color: "#EAF3FF",
  },
  actionButtonText_secondary: {
    color: "#E8FFF3",
  },
  actionButtonText_neutral: {
    color: "#D9E5FB",
  },
  actionButtonText_danger: {
    color: "#FFDCE1",
  },
  loader: {
    marginTop: 10,
  },
  previewImage: {
    marginTop: 10,
    width: "100%",
    height: 190,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#304869",
  },
  aiResultCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#304869",
    backgroundColor: "#111D30",
    borderRadius: 12,
    padding: 10,
    gap: 5,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  statusPill_authentic: {
    backgroundColor: "rgba(35,193,107,0.18)",
    borderColor: "#2FB574",
  },
  statusPill_review: {
    backgroundColor: "rgba(245,196,81,0.18)",
    borderColor: "#D8A73A",
  },
  statusPill_counterfeit: {
    backgroundColor: "rgba(240,99,99,0.2)",
    borderColor: "#CE5A5A",
  },
  statusPill_unknown: {
    backgroundColor: "rgba(232,111,111,0.2)",
    borderColor: "#D06A78",
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: FONTS.body,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statusPillText_authentic: {
    color: "#D6FFE8",
  },
  statusPillText_review: {
    color: "#FFF2CF",
  },
  statusPillText_counterfeit: {
    color: "#FFE2E2",
  },
  statusPillText_unknown: {
    color: "#FFE2E2",
  },
  resultCard: {
    borderWidth: 2,
  },
  resultCard_authentic: {
    backgroundColor: "#123E2A",
    borderColor: "#2FA16C",
  },
  resultCard_review: {
    backgroundColor: "#3D3213",
    borderColor: "#B18A2F",
  },
  resultCard_counterfeit: {
    backgroundColor: "#4A1E22",
    borderColor: "#C45B66",
  },
  resultCard_unknown: {
    backgroundColor: "#4A2730",
    borderColor: "#D06A78",
  },
  resultTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    fontFamily: FONTS.heading,
    color: "#F5F9FF",
    flex: 1,
    flexShrink: 1,
  },
  resultLine: {
    color: "#ECF3FF",
    fontSize: 15,
    marginBottom: 4,
    fontFamily: FONTS.body,
    lineHeight: 21,
  },
  resultLineSmall: {
    color: "#D8E4F8",
    fontSize: 13,
    marginBottom: 4,
    fontFamily: FONTS.body,
  },
  resultMetaLabel: {
    color: "#BFD0EA",
    fontSize: 12,
    marginTop: 6,
    marginBottom: 2,
    fontFamily: FONTS.body,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  resultExplain: {
    color: "#E4EEFF",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
    fontFamily: FONTS.body,
  },
  warnLine: {
    color: "#FFCC8A",
    fontSize: 13,
    marginBottom: 8,
    fontFamily: FONTS.body,
  },
  feedMetaRow: {
    marginBottom: 8,
  },
  feedMetaText: {
    color: "#95A8C6",
    fontSize: 12,
    marginBottom: 2,
    fontFamily: FONTS.body,
  },
  blogCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderColor: "#2B3D5E",
    borderWidth: 1,
    backgroundColor: "#111C2E",
  },
  blogEmergencyCard: {
    borderColor: "#CB5A6A",
    backgroundColor: "#291720",
  },
  blogHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  blogTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    color: "#F5F8FF",
    fontFamily: FONTS.heading,
    flex: 1,
  },
  blogBadge: {
    fontSize: 10,
    color: "#FFE1E6",
    backgroundColor: "#962E40",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "700",
    fontFamily: FONTS.body,
  },
  blogSummary: {
    fontSize: 15,
    color: "#CFDBF0",
    marginBottom: 8,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  blogTags: {
    fontSize: 12,
    color: "#9CD9B7",
    marginBottom: 8,
    fontFamily: FONTS.body,
  },
  blogBody: {
    marginTop: 10,
  },
  blogBullet: {
    color: "#E5EEFB",
    fontSize: 14,
    marginBottom: 6,
    fontFamily: FONTS.body,
    lineHeight: 20,
  },
  blogAction: {
    color: "#ABF0C8",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
    fontFamily: FONTS.body,
    lineHeight: 20,
  },
  reporterCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#304869",
    borderRadius: 12,
    backgroundColor: "#111D30",
    padding: 10,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTile: {
    width: "48%",
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2D4267",
    backgroundColor: "#121F34",
    padding: 10,
    justifyContent: "space-between",
  },
  metricLabel: {
    fontSize: 12,
    color: "#9FB2D2",
    fontFamily: FONTS.body,
  },
  metricValue: {
    fontSize: 18,
    color: "#E8F1FF",
    fontWeight: "800",
    fontFamily: FONTS.heading,
  },
  metricMonoValue: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: FONTS.mono,
  },
});
