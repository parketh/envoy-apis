"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const dev = process.env.NODE_ENV === "development";
exports.server = dev ? "http://localhost:3001" : "https://envoy-governance.vercel.app";
//# sourceMappingURL=config.js.map