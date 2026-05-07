import { motion } from "motion/react";
import { cn } from "../lib/utils";

export type BotState = "idle" | "thinking" | "speaking";

interface BotRendererProps {
  state: BotState;
  className?: string;
}

export function BotRenderer({ state, className }: BotRendererProps) {
  const outerRingVariants = {
    idle: {
      scale: 1,
      rotate: 0,
      borderColor: "rgba(0, 255, 65, 0.2)",
      transition: { duration: 10, repeat: Infinity, ease: "linear" }
    },
    thinking: {
      scale: [1, 1.05, 1],
      rotate: 180,
      borderColor: ["rgba(0, 255, 65, 0.2)", "rgba(0, 255, 65, 0.6)", "rgba(0, 255, 65, 0.2)"],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    },
    speaking: {
      scale: [1, 1.1, 1],
      rotate: 360,
      borderColor: ["rgba(0, 255, 65, 0.4)", "rgba(0, 102, 26, 0.8)", "rgba(0, 255, 65, 0.4)"],
      transition: { duration: 10, repeat: Infinity, ease: "linear" }
    }
  };

  const innerRingVariants = {
    idle: {
      scale: 1,
      rotate: 0,
      borderColor: "rgba(0, 255, 65, 0.4)",
      transition: { duration: 6, repeat: Infinity, ease: "linear", repeatType: "loop" as const }
    },
    thinking: {
      scale: [1, 0.9, 1],
      rotate: -180,
      borderColor: "rgba(0, 255, 65, 0.8)",
      transition: { duration: 1, repeat: Infinity, ease: "easeInOut" }
    },
    speaking: {
      scale: [1, 1.15, 1],
      rotate: -360,
      borderColor: "rgba(0, 255, 65, 0.6)",
      transition: { duration: 1.5, repeat: Infinity, ease: "linear" }
    }
  };

  const coreVariants = {
    idle: {
      scale: 1,
      boxShadow: "0 0 50px rgba(0, 255, 65, 0.2)",
      transition: { duration: 2, repeat: Infinity, repeatType: "reverse" as const, ease: "easeInOut" }
    },
    thinking: {
      scale: [1, 0.9, 1],
      boxShadow: "0 0 70px rgba(0, 255, 65, 0.6)",
      transition: { duration: 1, repeat: Infinity, ease: "easeInOut" }
    },
    speaking: {
      scale: [1, 1.05, 1],
      boxShadow: "0 0 90px rgba(0, 255, 65, 0.8)",
      transition: { duration: 0.2, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" }
    }
  };

  return (
    <div className={cn("relative w-80 h-80 flex items-center justify-center", className)}>
      <motion.div
        variants={outerRingVariants}
        animate={state}
        className="absolute w-full h-full border-2 rounded-full"
      />
      <motion.div
        variants={innerRingVariants}
        animate={state}
        className="absolute w-64 h-64 border rounded-full"
      />
      
      <div className="w-48 h-48 bg-gradient-to-tr from-[#00FF41] to-[#00661a] rounded-full blur-[40px] opacity-20 absolute pointer-events-none" />
      
      <motion.div
        variants={coreVariants}
        animate={state}
        className="w-32 h-32 bg-[#050505] border-2 border-[#00FF41] rounded-full flex items-center justify-center relative z-10"
      >
        <motion.div 
          animate={{ height: state === "speaking" ? [4, 24, 8, 32, 4] : state === "thinking" ? [4, 12, 4] : 4 }}
          transition={{ duration: state === "speaking" ? 0.4 : 1, repeat: Infinity, ease: "easeInOut" }}
          className="w-12 bg-[#00FF41] rounded-full"
        />
      </motion.div>
    </div>
  );
}
