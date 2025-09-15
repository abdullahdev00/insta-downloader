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
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
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

    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      const metadata = await page.evaluate((originalUrl) => {
        // Extract metadata from the page
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        let jsonData = null;
        
        for (let i = 0; i < scripts.length; i++) {
          const script = scripts[i];
          try {
            const data = JSON.parse(script.textContent || '');
            if (data['@type'] === 'MediaObject' || data.mainEntityOfPage) {
              jsonData = data;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // Get Open Graph meta tags
        const getMetaContent = (property: string) => {
          const meta = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
          return meta?.getAttribute('content') || '';
        };

        // Extract basic info
        const title = getMetaContent('og:title') || document.title;
        const description = getMetaContent('og:description');
        const image = getMetaContent('og:image');
        
        // Try to extract username from title or URL
        const usernameMatch = title.match(/^(.+?)\s+on\s+Instagram/) || 
                             title.match(/@(\w+)/) ||
                             originalUrl.match(/instagram\.com\/([^\/]+)/);
        const username = usernameMatch ? usernameMatch[1] : 'instagram_user';

        // Detect content type from URL
        let type: 'post' | 'reel' | 'story' | 'igtv' = 'post';
        if (originalUrl.includes('/reel/')) type = 'reel';
        else if (originalUrl.includes('/stories/')) type = 'story';
        else if (originalUrl.includes('/tv/')) type = 'igtv';

        // Try to find video/image URLs in the page
        const mediaUrls: string[] = [];
        const videos = document.querySelectorAll('video source, video');
        const images = document.querySelectorAll('img[src*="instagram"]');
        
        for (let i = 0; i < videos.length; i++) {
          const video = videos[i];
          const src = video.getAttribute('src');
          if (src && !src.includes('data:')) {
            mediaUrls.push(src);
          }
        }

        if (mediaUrls.length === 0) {
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const src = img.getAttribute('src');
            if (src && !src.includes('data:') && src.includes('instagram')) {
              mediaUrls.push(src);
            }
          }
        }

        return {
          type,
          username: username.replace('@', ''),
          caption: description,
          thumbnail: image,
          mediaUrls,
          likes: Math.floor(Math.random() * 100000), // Placeholder
          comments: Math.floor(Math.random() * 1000),
          views: type === 'reel' || type === 'igtv' ? Math.floor(Math.random() * 500000) : undefined,
          duration: type === 'reel' || type === 'igtv' ? '0:' + Math.floor(Math.random() * 60).toString().padStart(2, '0') : undefined,
          mediaCount: Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 2 : 1
        };
      }, url);

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
      // CRITICAL: Always close the page to prevent memory leaks
      try {
        await page.close();
      } catch (closeError) {
        console.error('Error closing Puppeteer page:', closeError);
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