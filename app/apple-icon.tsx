import { ImageResponse } from "next/og";
import { Mark } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#000", padding: 14 }}>
        <Mark size={152} />
      </div>
    ),
    size,
  );
}
