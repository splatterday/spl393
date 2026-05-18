import ThresholdScene from "@/components/ThresholdScene";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,158,100,0.12),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(255,218,117,0.08),_transparent_28%)]" />
      <div className="relative z-10 h-screen">
        <ThresholdScene />
      </div>

      <div className="relative z-20 mx-auto flex h-screen max-w-6xl flex-col justify-end px-6 pb-14 text-white sm:px-8">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm uppercase tracking-[0.45em] text-zinc-400">SPL393 / alchemical workshop</p>
          <h1 className="text-5xl font-serif leading-tight tracking-tight text-white sm:text-6xl">
            A dense digital sand field blooms into an inner gold sigil.
          </h1>
          <p className="max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
            An interactive landing threshold for SPL393: a dark, minimal gallery portal that transforms gesture and scroll into sculpted motion.
          </p>
        </div>
      </div>
    </div>
  );
}
