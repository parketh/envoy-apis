const dev = process.env.NODE_ENV === "development"

export const server = dev ? "http://localhost:3001" : "https://envoy-governance.vercel.app"
