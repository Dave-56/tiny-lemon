import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { GeneratedImage } from '../lib/types';

interface LightboxProps {
  open: boolean;
  image: GeneratedImage | null;
  onClose: () => void;
}

export function Lightbox({ open, image, onClose }: LightboxProps) {
  return (
    <AnimatePresence>
      {open && image && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={onClose}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors z-10"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <motion.img
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            src={image.url}
            alt="Generated Model"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
