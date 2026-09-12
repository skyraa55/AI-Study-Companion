const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    title: { type: String, required: true },
    type: { type: String, enum: ['text', 'pdf', 'note', 'link'], default: 'text' },
    sourceFileName: { type: String, default: null },

    rawContent: { type: String, default: '' },
    pageCount: { type: Number, default: 1 },

    // Heuristic flag: extractable text per page is suspiciously low, likely a
    // scanned/image-based PDF. OCR is not implemented in this prototype -
    // this is surfaced to the user rather than silently failing (PRD 12/13).
    possiblyScanned: { type: Boolean, default: false },

    // Lightweight structure signals (PRD 15 Knowledge Representation)
    structure: {
      hasTables: { type: Boolean, default: false },
      headingCount: { type: Number, default: 0 },
      notes: { type: String, default: '' },
    },

    knowledge: {
      summary: { type: String, default: '' },
      keyConcepts: [{ type: String }],
      chunks: [
        {
          text: String,
          order: Number,
          page: { type: Number, default: null }, // source reference (PRD 15)
        },
      ],
    },

    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },

    // Fine-grained pipeline stage for UI progress visibility (PRD 13/14)
    processingStage: {
      type: String,
      enum: [
        'queued',
        'reading_content',
        'understanding_structure',
        'extracting_knowledge',
        'creating_search_index',
        'ready',
        'failed',
      ],
      default: 'queued',
    },
    processingProgress: { type: Number, default: 0 },
    retryCount: { type: Number, default: 0 },
    processingError: { type: String, default: null },
  },
  { timestamps: true }
);

materialSchema.index({ project: 1, processingStatus: 1 });

module.exports = mongoose.model('Material', materialSchema);