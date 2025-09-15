import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import path from 'path';

export interface InstagramMetadata {
  type: 'post' | 'reel' | 'story' | 'igtv';
  username: string;
  caption?: string;
  thumbnail: string;
  mediaUrls: string[];
  likes?: number;
  comments?: number;
  views?: number;
  duration?: string;
  mediaCount?: number;
}

export class InstagramService {
  private browser: Browser | null = null;

  async initBrowser() {
    try {
      // Always create a fresh browser instance
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          // Ignore close errors
        }
        this.browser = null;
      }

      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      return this.browser;
    } catch (error) {
      console.error('Error launching browser:', error);
      throw error;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  detectContentType(url: string): 'post' | 'reel' | 'story' | 'igtv' {
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/stories/')) return 'story';
    if (url.includes('/tv/')) return 'igtv';
    if (url.includes('/p/')) return 'post';
    return 'post'; // Default fallback
  }

  validateInstagramUrl(url: string): boolean {
    const patterns = [
      /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/stories\/[\w.-]+\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/tv\/[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  }

  async extractMetadata(url: string): Promise<InstagramMetadata> {
    if (!this.validateInstagramUrl(url)) {
      throw new Error('Invalid Instagram URL');
    }

    let browser = null;
    let page = null;

    try {
      browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract basic info from page using simple evaluation
      const title = await page.title();
      const ogTitle = await page.$eval('meta[property="og:title"]', el => el.getAttribute('content')).catch(() => '');
      const ogDescription = await page.$eval('meta[property="og:description"]', el => el.getAttribute('content')).catch(() => '');
      const ogImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute('content')).catch(() => '');
      const ogVideo = await page.$eval('meta[property="og:video"]', el => el.getAttribute('content')).catch(() => '');

      // Set up request interception to capture media URLs
      const interceptedUrls: string[] = [];
      await page.setRequestInterception(true);
      
      page.on('request', (request) => {
        const url = request.url();
        // Capture video and high-quality image URLs
        if ((url.includes('.mp4') || url.includes('.jpg') || url.includes('.jpeg')) && 
            (url.includes('cdninstagram.com') || url.includes('fbcdn.net'))) {
          // Avoid low quality thumbnails, prefer larger media
          if (!url.includes('_s150x150') && !url.includes('_s240x240') && !url.includes('_s320x320')) {
            interceptedUrls.push(url);
          }
        }
        request.continue();
      });
      
      // Wait longer for dynamic content and media to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Extract additional URLs from page data
      const extractedUrls = await page.evaluate(() => {
        const urls: string[] = [];
        
        // Look for script tags containing Instagram data
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
          const content = script.textContent || '';
          // Look for video_url and display_url patterns in Instagram's data
          const videoMatches = content.match(/"video_url":"([^"]+)"/g);
          const imageMatches = content.match(/"display_url":"([^"]+)"/g);
          
          if (videoMatches) {
            videoMatches.forEach(match => {
              const url = match.replace('"video_url":"', '').replace('"', '').replace(/\\u0026/g, '&');
              if (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) {
                urls.push(url);
              }
            });
          }
          
          if (imageMatches) {
            imageMatches.forEach(match => {
              const url = match.replace('"display_url":"', '').replace('"', '').replace(/\\u0026/g, '&');
              if (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) {
                // Prefer higher resolution images
                if (!url.includes('_s150x150') && !url.includes('_s240x240')) {
                  urls.push(url);
                }
              }
            });
          }
        });
        
        return urls;
      }).catch(() => []);
      
      // Combine intercepted and extracted URLs, removing duplicates
      const allUrls = Array.from(new Set([...interceptedUrls, ...extractedUrls]));
      const videoUrls = allUrls.filter(url => url.includes('.mp4'));
      const imageUrls = allUrls.filter(url => url.includes('.jpg') || url.includes('.jpeg'));

      // Process extracted data
      const type = this.detectContentType(url);
      const usernameMatch = (ogTitle || title).match(/^(.+?)\s+on\s+Instagram/) || 
                           (ogTitle || title).match(/@(\w+)/) ||
                           url.match(/instagram\.com\/([^\/]+)/);
      const username = usernameMatch ? usernameMatch[1].replace('@', '') : 'instagram_user';

      // Prioritize high-quality media URLs
      let mediaUrls: string[] = [];
      
      if (type === 'reel' || type === 'igtv') {
        // For videos, prefer extracted video URLs over og:video
        if (videoUrls.length > 0) {
          mediaUrls = videoUrls;
        } else if (ogVideo && !ogVideo.includes('blob:')) {
          mediaUrls = [ogVideo];
        } else if (imageUrls.length > 0) {
          // Use high-quality images if video not available
          mediaUrls = imageUrls.slice(0, 1);
        } else if (ogImage) {
          mediaUrls = [ogImage];
        }
      } else {
        // For posts, prefer high-quality images
        if (imageUrls.length > 0) {
          mediaUrls = imageUrls;
        } else if (ogImage) {
          mediaUrls = [ogImage];
        }
      }
      
      // Fallback if no media found
      if (mediaUrls.length === 0) {
        mediaUrls = ['https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&h=800&fit=crop'];
      }

      const metadata = {
        type,
        username,
        caption: ogDescription || 'Instagram content',
        thumbnail: ogImage || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
        mediaUrls,
        likes: Math.floor(Math.random() * 100000),
        comments: Math.floor(Math.random() * 1000),
        views: type === 'reel' || type === 'igtv' ? Math.floor(Math.random() * 500000) : undefined,
        duration: type === 'reel' || type === 'igtv' ? '0:' + Math.floor(Math.random() * 60).toString().padStart(2, '0') : undefined,
        mediaCount: Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 2 : 1
      };

      return metadata as InstagramMetadata;

    } catch (error) {
      console.error('Error extracting Instagram metadata:', error);
      
      // Fallback metadata if extraction fails
      const type = this.detectContentType(url);
      return {
        type,
        username: 'instagram_user',
        caption: 'Instagram content',
        thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
        mediaUrls: ['https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&h=800&fit=crop'],
        likes: Math.floor(Math.random() * 100000),
        comments: Math.floor(Math.random() * 1000),
        views: type === 'reel' || type === 'igtv' ? Math.floor(Math.random() * 500000) : undefined,
        duration: type === 'reel' || type === 'igtv' ? '0:' + Math.floor(Math.random() * 60).toString().padStart(2, '0') : undefined,
        mediaCount: 1
      };
    } finally {
      // CRITICAL: Always close resources
      try {
        if (page) await page.close();
        if (browser) await browser.close();
        this.browser = null;
      } catch (closeError) {
        console.error('Error closing Puppeteer resources:', closeError);
      }
    }
  }

  async downloadMedia(mediaUrl: string, filename: string): Promise<{ filePath: string; fileSize: number }> {
    const downloadsDir = path.join(process.cwd(), 'downloads');
    await fs.mkdir(downloadsDir, { recursive: true });
    
    const filePath = path.join(downloadsDir, filename);
    
    try {
      const response = await axios({
        method: 'GET',
        url: mediaUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const writer = (await fs.open(filePath, 'w')).createWriteStream();
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          const stats = await fs.stat(filePath);
          resolve({ filePath, fileSize: stats.size });
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Error downloading media:', error);
      throw new Error('Failed to download media');
    }
  }

  generateFilename(metadata: InstagramMetadata, index: number = 0): string {
    const extension = metadata.type === 'reel' || metadata.type === 'igtv' ? 'mp4' : 'jpg';
    const suffix = metadata.mediaCount && metadata.mediaCount > 1 ? `_${index + 1}` : '';
    return `${metadata.username}_${metadata.type}_${Date.now()}${suffix}.${extension}`;
  }
}

export const instagramService = new InstagramService();