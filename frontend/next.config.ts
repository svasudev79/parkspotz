import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // The browser only talks to this site; /api/* is forwarded to the Express API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
  // A guest's receipt link is private: whoever has it can see the receipt.
  // Keep it out of search engines and out of the Referer header sent elsewhere.
  async headers() {
    return [
      {
        source: "/receipt/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
