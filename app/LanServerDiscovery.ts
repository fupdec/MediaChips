class LanServerDiscovery {
  fixedPort: number
  timeout: number
  networkIpRange: { base: string; start: number; end: number } | null

  constructor() {
    this.fixedPort = 12321; // Fixed port
    this.timeout = 2000; // Check timeout
    this.networkIpRange = null;
  }

  // Get the client IP and determine the network
  async getClientNetworkInfo() {
    try {
      // Use WebRTC to get the client's local IP
      const ip = await this.getClientLocalIp();
      if (ip) {
        // Determine the network range (for example, 192.168.1.0/24)
        this.networkIpRange = this.calculateNetworkRange(ip);
        return ip;
      }
    } catch (error) {
      console.warn('Failed to get client IP:', error);
    }

    // Fallback: use typical local network ranges
    return null;
  }

  // Get the local IP via WebRTC
  async getClientLocalIp(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });

      pc.createDataChannel(''); // Create a channel to receive candidates
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => resolve(null));

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) return;

        const candidate = ice.candidate.candidate;
        const regex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const match = candidate.match(regex);

        if (match) {
          const ip = match[1];
          // Filter local addresses
          if (this.isLocalIp(ip)) {
            pc.onicecandidate = null;
            pc.close();
            resolve(ip);
          }
        }
      };

      // Timeout
      setTimeout(() => {
        pc.onicecandidate = null;
        pc.close();
        resolve(null);
      }, 1000);
    });
  }

  // Determine the network range
  calculateNetworkRange(clientIp: string) {
    const parts = clientIp.split('.').map(Number);

    // For typical local networks:
    // 192.168.x.x, 10.x.x.x, 172.16-31.x.x
    if (parts[0] === 192 && parts[1] === 168) {
      return {
        base: `192.168.${parts[2]}`,
        start: 1,
        end: 254
      };
    } else if (parts[0] === 10) {
      return {
        base: `10.${parts[1]}.${parts[2]}`,
        start: 1,
        end: 254
      };
    } else if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return {
        base: `172.${parts[1]}.${parts[2]}`,
        start: 1,
        end: 254
      };
    }

    // By default, use only the current segment
    return {
      base: `${parts[0]}.${parts[1]}.${parts[2]}`,
      start: 1,
      end: 254
    };
  }

  // Main server discovery function
  async discoverServer() {
    console.log('🔍 Searching for a server on the local network...');

    // 1. Try localhost
    const localhostResult = await this.checkServer('localhost');
    if (localhostResult.success) {
      console.log('✅ Server found on localhost');
      return localhostResult;
    }

    // 2. Get network information
    await this.getClientNetworkInfo();

    // 3. Check the most likely addresses
    const quickChecks = [
      '127.0.0.1',
      ...this.getCommonLocalIps()
    ];

    // Check quick addresses in parallel
    const quickPromises = quickChecks.map(ip =>
      this.checkServer(ip)
    );

    const quickResults = await Promise.allSettled(quickPromises);
    for (const result of quickResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        console.log(`✅ Server found during quick search: ${result.value.ip}`);
        return result.value;
      }
    }

    // 4. If not found, scan the network
    if (this.networkIpRange) {
      console.log(`🌐 Scanning network: ${this.networkIpRange.base}.x`);

      const foundServer = await this.scanNetworkRange();
      if (foundServer) {
        return foundServer;
      }
    }

    // 5. Nothing found
    return {
      success: false,
      ip: null,
      message: 'Server not found on the local network'
    };
  }

  // Scan an IP range
  async scanNetworkRange() {
    if (!this.networkIpRange) return null;

    const { base, start, end } = this.networkIpRange;
    const batchSize = 10; // Parallel requests

    // Split into batches for parallel checks
    for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, end);
      const promises = [];

      // Create promises for the batch
      for (let i = batchStart; i <= batchEnd; i++) {
        const ip = `${base}.${i}`;
        promises.push(this.checkServer(ip));
      }

      // Wait for the batch to complete
      const results = await Promise.allSettled(promises);

      // Check results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          console.log(`✅ Server found during scan: ${result.value.ip}`);
          return result.value;
        }
      }

      // Small delay between batches
      if (batchEnd < end) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return null;
  }

  // Check a specific IP
  async checkServer(ip: string) {
    const url = `http://${ip}:${this.fixedPort}/api/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      const endTime = performance.now();

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          ip: ip,
          url: `http://${ip}:${this.fixedPort}`,
          apiUrl: `http://${ip}:${this.fixedPort}/api`,
          responseTime: Math.round(endTime - startTime),
          status: data.status,
          timestamp: new Date().toISOString()
        };
      }
    } catch (_error) {
      clearTimeout(timeoutId);
      // Silent failure: the server simply did not respond
    }

    return {
      success: false,
      ip: ip
    };
  }

  // Get commonly used local IPs
  getCommonLocalIps() {
    const commonIps = [];

    // Most common LAN addresses
    for (let i = 1; i <= 20; i++) {
      commonIps.push(`192.168.1.${i}`);
      commonIps.push(`192.168.0.${i}`);
      commonIps.push(`10.0.0.${i}`);
      commonIps.push(`172.16.0.${i}`);
    }

    // Add .100, .200, and .254 (commonly used for servers)
    commonIps.push('192.168.1.100', '192.168.1.200', '192.168.1.254');
    commonIps.push('192.168.0.100', '192.168.0.200', '192.168.0.254');

    return commonIps;
  }

  // Check whether an IP is local
  isLocalIp(ip: string) {
    const parts = ip.split('.').map(Number);

    // Localhost
    if (ip === '127.0.0.1') return true;

    // Private ranges:
    // 10.0.0.0 - 10.255.255.255
    if (parts[0] === 10) return true;

    // 172.16.0.0 - 172.31.255.255
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0 - 192.168.255.255
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 169.254.0.0 - 169.254.255.255 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;

    return false;
  }
}

export default new LanServerDiscovery();
