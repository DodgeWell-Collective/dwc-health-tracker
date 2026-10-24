import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse prefetched and visited pages for 5 minutes so tab and day switches are instant.
    // Every server action calls revalidatePath, which clears this cache, so edits show right away.
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
