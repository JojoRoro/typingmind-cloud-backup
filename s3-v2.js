// S3 Client Configuration
class S3SyncManager {
  constructor(config) {
    this.config = config;
    this.changeQueue = [];
    this.lastSyncTimestamp = 0;
    this.isSyncing = false;
    this.pendingChanges = new Map();
  }

  // Queue changes instead of immediate sync
  queueChange(change) {
    this.changeQueue.push({
      ...change,
      timestamp: Date.now(),
      deviceId: this.getDeviceId()
    });
    this.scheduleSyncIfNeeded();
  }

  // Intelligent sync scheduling
  scheduleSyncIfNeeded() {
    if (!this.isSyncing && this.changeQueue.length > 0) {
      const SYNC_DELAY = 5000; // 5 seconds
      setTimeout(() => this.performSync(), SYNC_DELAY);
    }
  }

  // Perform actual sync with conflict resolution
  async performSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // Get remote state first
      const remoteState = await this.fetchRemoteState();
      
      // Merge changes with conflict resolution
      const mergedState = this.mergeChanges(remoteState, this.changeQueue);
      
      // Only upload if there are actual changes
      if (this.hasChanges(mergedState, remoteState)) {
        await this.uploadDiff(mergedState, remoteState);
      }

      this.changeQueue = [];
      this.lastSyncTimestamp = Date.now();
    } catch (error) {
      console.error('Sync failed:', error);
      // Keep changes in queue for retry
    } finally {
      this.isSyncing = false;
    }
  }

  // Three-way merge implementation
  mergeChanges(remoteState, localChanges) {
    const baseState = this.getLastKnownState();
    const merged = { ...remoteState };

    for (const change of localChanges) {
      const remoteVersion = remoteState[change.id];
      const baseVersion = baseState[change.id];

      if (!remoteVersion || remoteVersion.timestamp < change.timestamp) {
        // Local change is newer
        merged[change.id] = change;
      } else if (remoteVersion.timestamp === change.timestamp) {
        // Same timestamp, use device ID as tiebreaker
        if (change.deviceId > remoteVersion.deviceId) {
          merged[change.id] = change;
        }
      }
      // Otherwise keep remote version
    }

    return merged;
  }

  // Upload only changed data
  async uploadDiff(newState, oldState) {
    const diff = this.calculateDiff(newState, oldState);
    if (Object.keys(diff).length === 0) return;

    // Upload diff using multipart upload for large changes
    const upload = new S3MultipartUpload(this.config);
    await upload.uploadDiff(diff);
  }

  // Calculate difference between states
  calculateDiff(newState, oldState) {
    const diff = {};
    for (const [key, value] of Object.entries(newState)) {
      if (!oldState[key] || oldState[key].timestamp !== value.timestamp) {
        diff[key] = value;
      }
    }
    return diff;
  }

  // Get unique device identifier
  getDeviceId() {
    if (!this._deviceId) {
      this._deviceId = localStorage.getItem('deviceId') || 
        crypto.randomUUID();
      localStorage.setItem('deviceId', this._deviceId);
    }
    return this._deviceId;
  }
}

// Efficient multipart upload implementation
class S3MultipartUpload {
  constructor(config) {
    this.config = config;
    this.PART_SIZE = 5 * 1024 * 1024; // 5MB parts
  }

  async uploadDiff(diff) {
    const data = JSON.stringify(diff);
    if (data.length < this.PART_SIZE) {
      return this.uploadSingle(data);
    }
    return this.uploadMultipart(data);
  }

  // Implementation details for uploads...
}

// Export the manager
export const syncManager = new S3SyncManager({
  // Configuration options
});