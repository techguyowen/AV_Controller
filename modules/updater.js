/**
 * modules/updater.js
 * Sanctuary AV Controller — Automated Update Manager
 *
 * Checks GitHub repository for updates and performs 1-click updates.
 * Supports both Git repos (via git fetch/pull) and direct ZIP downloads (non-git).
 * ALWAYS strictly preserves config.json and .env during updates.
 */

const { exec, spawn } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const https = require('https');

const execAsync = util.promisify(exec);

class AutoUpdater {
  constructor(options = {}) {
    this.repo = options.repo || 'techguyowen/AV_Controller';
    this.branch = options.branch || 'main';
    this.rootDir = options.rootDir || path.resolve(__dirname, '..');
    this.onStateChange = options.onStateChange || null;

    // Load current version from package.json
    this.currentVersion = '1.0.0';
    try {
      const pkgPath = path.join(this.rootDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        this.currentVersion = pkg.version || '1.0.0';
      }
    } catch (e) {
      console.warn('[Updater] Failed to read package.json version:', e.message);
    }

    this.state = {
      checking: false,
      updating: false,
      updateAvailable: false,
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      currentCommit: '',
      latestCommit: '',
      commitMessage: '',
      commitDate: '',
      commitsBehind: 0,
      lastChecked: null,
      isGitRepo: false,
      error: null,
      progressMessage: '',
    };

    // Check if git directory exists
    this.state.isGitRepo = fs.existsSync(path.join(this.rootDir, '.git'));

    // Start background checks: 10s after boot, then every 6 hours
    this.initSchedule();
  }

  initSchedule() {
    setTimeout(() => {
      this.checkForUpdates().catch(err => {
        console.warn('[Updater] Initial update check failed:', err.message);
      });
    }, 10000);

    // 6 hours interval
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch(err => {
        console.warn('[Updater] Scheduled update check failed:', err.message);
      });
    }, 6 * 60 * 60 * 1000);
  }

  getState() {
    return { ...this.state };
  }

  notifyStateChange() {
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(this.getState());
      } catch (err) {
        console.error('[Updater] onStateChange error:', err);
      }
    }
  }

  /**
   * Helper: Make an HTTPS GET request returning parsed JSON
   */
  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Sanctuary-AV-Controller-Updater',
          'Accept': 'application/vnd.github.v3+json',
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJson(res.headers.location).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub API HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(rawData));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('GitHub API request timed out after 10s'));
      });
    });
  }

  /**
   * Check for updates using Git if available, or GitHub REST API as fallback
   */
  async checkForUpdates() {
    if (this.state.checking || this.state.updating) {
      return this.getState();
    }

    this.state.checking = true;
    this.state.error = null;
    this.notifyStateChange();

    try {
      this.state.isGitRepo = fs.existsSync(path.join(this.rootDir, '.git'));

      if (this.state.isGitRepo) {
        await this._checkViaGit();
      } else {
        await this._checkViaGitHubApi();
      }

      this.state.lastChecked = new Date().toISOString();
    } catch (err) {
      console.warn('[Updater] Update check error:', err.message);
      this.state.error = err.message;
      // If git failed, attempt fallback to API
      if (this.state.isGitRepo) {
        try {
          await this._checkViaGitHubApi();
          this.state.error = null;
          this.state.lastChecked = new Date().toISOString();
        } catch (apiErr) {
          this.state.error = `Git: ${err.message} | API: ${apiErr.message}`;
        }
      }
    } finally {
      this.state.checking = false;
      this.notifyStateChange();
    }

    return this.getState();
  }

  async _checkViaGit() {
    const cwd = this.rootDir;

    // 1. Fetch latest commits from remote
    await execAsync(`git fetch origin ${this.branch}`, { cwd, timeout: 15000 });

    // 2. Get local HEAD short hash
    const { stdout: localHash } = await execAsync('git rev-parse --short HEAD', { cwd });
    this.state.currentCommit = localHash.trim();

    // 3. Get remote short hash
    const { stdout: remoteHash } = await execAsync(`git rev-parse --short origin/${this.branch}`, { cwd });
    this.state.latestCommit = remoteHash.trim();

    // 4. Count commits behind
    const { stdout: behindCount } = await execAsync(`git rev-list HEAD..origin/${this.branch} --count`, { cwd });
    const count = parseInt(behindCount.trim(), 10) || 0;
    this.state.commitsBehind = count;
    this.state.updateAvailable = count > 0;

    // 5. Get latest remote commit message and date
    const { stdout: commitSummary } = await execAsync(`git log -1 --format="%s" origin/${this.branch}`, { cwd });
    this.state.commitMessage = commitSummary.trim();

    const { stdout: commitDate } = await execAsync(`git log -1 --format="%cd" --date=short origin/${this.branch}`, { cwd });
    this.state.commitDate = commitDate.trim();

    // 6. Check package.json version on origin/main if possible
    try {
      const { stdout: remotePkgJson } = await execAsync(`git show origin/${this.branch}:package.json`, { cwd });
      const remotePkg = JSON.parse(remotePkgJson);
      if (remotePkg.version) {
        this.state.latestVersion = remotePkg.version;
      }
    } catch (e) {
      // Non-fatal, version stays as current
    }
  }

  async _checkViaGitHubApi() {
    const url = `https://api.github.com/repos/${this.repo}/commits/${this.branch}`;
    const data = await this.fetchJson(url);

    if (data && data.sha) {
      this.state.latestCommit = data.sha.substring(0, 7);
      if (data.commit) {
        this.state.commitMessage = data.commit.message ? data.commit.message.split('\n')[0] : '';
        this.state.commitDate = data.commit.committer?.date ? data.commit.committer.date.split('T')[0] : '';
      }

      // Check remote package.json
      try {
        const rawPkgUrl = `https://raw.githubusercontent.com/${this.repo}/${this.branch}/package.json`;
        const pkgData = await this.fetchJson(rawPkgUrl);
        if (pkgData && pkgData.version) {
          this.state.latestVersion = pkgData.version;
          this.state.updateAvailable = (pkgData.version !== this.state.currentVersion) ||
            (this.state.currentCommit && this.state.currentCommit !== this.state.latestCommit);
        }
      } catch (pkgErr) {
        if (this.state.currentCommit) {
          this.state.updateAvailable = this.state.currentCommit !== this.state.latestCommit;
        }
      }
    }
  }

  /**
   * Execute update and restart server
   */
  async performUpdate() {
    if (this.state.updating) {
      return { success: false, message: 'Update already in progress' };
    }

    this.state.updating = true;
    this.state.error = null;
    this.state.progressMessage = 'Starting update...';
    this.notifyStateChange();

    try {
      if (this.state.isGitRepo) {
        await this._updateViaGit();
      } else {
        await this._updateViaZip();
      }

      this.state.progressMessage = 'Update complete. Restarting server in 2 seconds...';
      this.notifyStateChange();

      // Schedule graceful restart
      this.scheduleRestart(2000);

      return {
        success: true,
        message: 'Updated successfully. Server is restarting...',
      };
    } catch (err) {
      console.error('[Updater] Update failed:', err);
      this.state.updating = false;
      this.state.error = err.message;
      this.state.progressMessage = `Update failed: ${err.message}`;
      this.notifyStateChange();
      throw err;
    }
  }

  async _updateViaGit() {
    const cwd = this.rootDir;

    this.state.progressMessage = 'Pulling latest code from GitHub...';
    this.notifyStateChange();
    await execAsync(`git pull origin ${this.branch}`, { cwd, timeout: 30000 });

    this.state.progressMessage = 'Installing dependencies (npm install)...';
    this.notifyStateChange();
    await execAsync('npm install --no-audit --no-fund', { cwd, timeout: 120000 });
  }

  async _updateViaZip() {
    const cwd = this.rootDir;
    const backupDir = path.join(cwd, '.update_backup');

    this.state.progressMessage = 'Preserving local configuration files...';
    this.notifyStateChange();

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Strictly preserve config.json and .env
    const configPath = path.join(cwd, 'config.json');
    const envPath = path.join(cwd, '.env');

    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, path.join(backupDir, 'config.json'));
    }
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, path.join(backupDir, '.env'));
    }

    // Download latest zip archive
    this.state.progressMessage = 'Downloading update archive from GitHub...';
    this.notifyStateChange();

    const zipUrl = `https://codeload.github.com/${this.repo}/zip/refs/heads/${this.branch}`;
    const zipPath = path.join(backupDir, 'update.zip');

    await this._downloadFile(zipUrl, zipPath);

    this.state.progressMessage = 'Extracting update files...';
    this.notifyStateChange();

    if (process.platform === 'win32') {
      await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${backupDir}\\extracted' -Force"`, { cwd });
    } else {
      await execAsync(`unzip -o -q "${zipPath}" -d "${backupDir}/extracted"`, { cwd });
    }

    const extractedFolder = path.join(backupDir, 'extracted', `AV_Controller-${this.branch}`);
    if (fs.existsSync(extractedFolder)) {
      this._copyDirFiltered(extractedFolder, cwd, ['config.json', '.env', '.git']);
    }

    // Restore preserved config.json and .env
    if (fs.existsSync(path.join(backupDir, 'config.json'))) {
      fs.copyFileSync(path.join(backupDir, 'config.json'), configPath);
    }
    if (fs.existsSync(path.join(backupDir, '.env'))) {
      fs.copyFileSync(path.join(backupDir, '.env'), envPath);
    }

    // Clean up temporary download directory
    try {
      fs.rmSync(backupDir, { recursive: true, force: true });
    } catch (e) {
      // Non-fatal
    }

    this.state.progressMessage = 'Installing dependencies (npm install)...';
    this.notifyStateChange();
    await execAsync('npm install --no-audit --no-fund', { cwd, timeout: 120000 });
  }

  _copyDirFiltered(src, dest, ignoreFiles = []) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreFiles.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        this._copyDirFiltered(srcPath, destPath, ignoreFiles);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  _downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const req = https.get(url, {
        headers: { 'User-Agent': 'Sanctuary-AV-Controller-Updater' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`Download failed with status HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      });

      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

      req.setTimeout(60000, () => {
        req.destroy(new Error('Download timed out after 60s'));
      });
    });
  }

  /**
   * Detached server restart
   */
  scheduleRestart(delayMs = 2000) {
    setTimeout(() => {
      console.log('[Updater] Spawning detached server process and exiting...');
      try {
        const child = spawn(process.argv[0], process.argv.slice(1), {
          detached: true,
          stdio: 'inherit',
          cwd: this.rootDir,
        });
        child.unref();
      } catch (err) {
        console.error('[Updater] Failed to spawn restart process:', err);
      }
      process.exit(0);
    }, delayMs);
  }
}

module.exports = AutoUpdater;
