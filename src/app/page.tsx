import ThresholdScene from "@/components/ThresholdScene";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,158,100,0.12),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(255,218,117,0.08),_transparent_28%)]" />
      <div className="relative z-10 h-screen">
        <ThresholdScene />
      </div>
    </div>
  );
}
