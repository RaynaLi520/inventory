import path from "node:path";
import QRCode from "qrcode";

const options = {
  width: 360,
  margin: 2,
  errorCorrectionLevel: "M",
  color: { dark: "#173f35", light: "#ffffff" }
};

await Promise.all([
  QRCode.toFile(
    path.resolve("assets/mobile-setup-qr.png"),
    "https://henan-inventory.vercel.app/mobile-install.html",
    options
  ),
  QRCode.toFile(
    path.resolve("assets/internal-app-qr.png"),
    "https://172.16.100.198/",
    options
  )
]);

console.log("Mobile setup QR codes generated.");
