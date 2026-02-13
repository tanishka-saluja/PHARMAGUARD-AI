import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-react-native";
import * as mobilenet from "@tensorflow-models/mobilenet";
import { decodeJpeg, fetch as tfFetch } from "@tensorflow/tfjs-react-native";

const MEDICINE_CLASS_HINTS = [
  "pill bottle",
  "medicine chest",
  "syringe",
  "vial",
  "bottle",
  "packet",
  "carton",
  "box",
  "bandage",
  "first aid",
];

let modelInstance = null;
let loadPromise = null;

export async function initMobileNet() {
  if (modelInstance) {
    return modelInstance;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      await tf.ready();
      modelInstance = await mobilenet.load({ version: 2, alpha: 1.0 });
      return modelInstance;
    })();
  }

  return loadPromise;
}

export async function classifyImageUri(imageUri) {
  const model = await initMobileNet();

  const response = await tfFetch(imageUri, {}, { isBinary: true });
  const imageDataArrayBuffer = await response.arrayBuffer();
  const imageData = new Uint8Array(imageDataArrayBuffer);

  const imageTensor = decodeJpeg(imageData, 3);

  try {
    const predictions = await model.classify(imageTensor);
    return predictions || [];
  } finally {
    imageTensor.dispose();
  }
}

export function scoreMobileNetRisk(predictions) {
  if (!predictions || predictions.length === 0) {
    return {
      outcome: "review",
      status: "REVIEW REQUIRED",
      risk: "MobileNet could not classify packaging",
      suggestedSeverity: 2,
      confidence: 0,
      topClass: "unknown",
    };
  }

  const top = predictions[0];
  const topClass = String(top.className || "").toLowerCase();
  const confidence = Number(top.probability || 0);

  const hasMedicineHint = MEDICINE_CLASS_HINTS.some((hint) => topClass.includes(hint));

  if (hasMedicineHint && confidence >= 0.3) {
    return {
      outcome: "review",
      status: "LOW ANOMALY (VERIFY ON-CHAIN)",
      risk: `Packaging appears normal (${top.className}) but still requires blockchain verification`,
      suggestedSeverity: 2,
      confidence,
      topClass: top.className,
    };
  }

  if (!hasMedicineHint && confidence >= 0.5) {
    return {
      outcome: "counterfeit",
      status: "POTENTIAL COUNTERFEIT",
      risk: `Packaging class mismatch: ${top.className}`,
      suggestedSeverity: 3,
      confidence,
      topClass: top.className,
    };
  }

  return {
    outcome: "review",
    status: "REVIEW REQUIRED",
    risk: `Low-confidence packaging inference: ${top.className}`,
    suggestedSeverity: 2,
    confidence,
    topClass: top.className,
  };
}
