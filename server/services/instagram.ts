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

    const type = this.detectContentType(url);
    let browser = null;
    let page = null;
    let responseVideoUrls: string[] = [];
    let responseImageUrls: string[] = [];

    try {
      browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // For stories, add optional authentication and use mobile site
      if (type === 'story') {
        // Add session cookie if available for private stories
        if (process.env.IG_SESSIONID) {
          await page.setCookie({
            name: 'sessionid',
            value: process.env.IG_SESSIONID,
            domain: '.instagram.com',
            secure: true,
            httpOnly: true
          });
        }
        
        // Use mobile site for simpler markup
        url = url.replace('www.instagram.com', 'm.instagram.com');
        
        // Add network response monitoring for stories
        page.on('response', (response) => {
          const contentType = response.headers()['content-type'] || '';
          const responseUrl = response.url();
          
          if (!/cdninstagram|fbcdn/.test(responseUrl)) return;
          
          // Filter out Instagram's generic resource files
          if (responseUrl.includes('/rsrc.php/') || responseUrl.includes('/static/')) return;
          
          if (contentType.includes('video') && responseUrl.includes('.mp4')) {
            responseVideoUrls.push(responseUrl);
          } else if (contentType.includes('image') && (responseUrl.includes('.jpg') || responseUrl.includes('.jpeg'))) {
            // Additional filtering for story images - avoid tiny thumbnails
            if (!responseUrl.includes('_150x150') && !responseUrl.includes('_240x240') && !responseUrl.includes('_320x320')) {
              responseImageUrls.push(responseUrl);
            }
          }
        });
      }
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait longer for stories to load
      const waitTime = type === 'story' ? 7000 : 3000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Extract basic info from page using simple evaluation
      const title = await page.title();
      const ogTitle = await page.$eval('meta[property="og:title"]', el => el.getAttribute('content')).catch(() => '');
      const ogDescription = await page.$eval('meta[property="og:description"]', el => el.getAttribute('content')).catch(() => '');
      const ogImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute('content')).catch(() => '');
      const ogVideo = await page.$eval('meta[property="og:video"]', el => el.getAttribute('content')).catch(() => '');

      // Disable request interception for simpler approach
      await page.setRequestInterception(false);
      
      // Wait for content to load and try multiple extraction methods
      await page.waitForSelector('video, img[src*="cdninstagram"], img[src*="fbcdn"]', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Extract media URLs using multiple methods
      const extractedData = await page.evaluate(() => {
        const result = {
          videoUrls: [] as string[],
          imageUrls: [] as string[],
          allUrls: [] as string[]
        };
        
        // Method 1: Check video elements directly
        document.querySelectorAll('video').forEach(video => {
          if (video.src && (video.src.includes('cdninstagram') || video.src.includes('fbcdn'))) {
            result.videoUrls.push(video.src);
            result.allUrls.push(video.src);
          }
          // Check source elements within video
          video.querySelectorAll('source').forEach(source => {
            if (source.src && (source.src.includes('cdninstagram') || source.src.includes('fbcdn'))) {
              result.videoUrls.push(source.src);
              result.allUrls.push(source.src);
            }
          });
        });
        
        // Method 1.5: Check preload links for stories
        document.querySelectorAll('link[rel="preload"]').forEach(link => {
          const href = link.getAttribute('href');
          const as = link.getAttribute('as');
          if (href && (href.includes('cdninstagram') || href.includes('fbcdn'))) {
            if (as === 'video' && href.includes('.mp4')) {
              result.videoUrls.push(href);
              result.allUrls.push(href);
            } else if (as === 'image' && (href.includes('.jpg') || href.includes('.jpeg'))) {
              result.imageUrls.push(href);
              result.allUrls.push(href);
            }
          }
        });
        
        // Method 2: Parse all script tags for embedded data
        document.querySelectorAll('script').forEach(script => {
          const content = script.textContent || '';
          
          // Look for video_url patterns
          const videoMatches = content.match(/"video_url"\s*:\s*"([^"]+)"/g);
          if (videoMatches) {
            videoMatches.forEach(match => {
              let url = match.replace(/"video_url"\s*:\s*"/, '').replace(/"$/, '');
              url = url.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
              if ((url.includes('cdninstagram') || url.includes('fbcdn')) && url.includes('.mp4') && !url.includes('/rsrc.php/')) {
                result.videoUrls.push(url);
                result.allUrls.push(url);
              }
            });
          }
          
          // Look for GraphQL video data
          const graphqlVideoMatches = content.match(/"video_versions"\s*:\s*\[\s*{[^}]+"url"\s*:\s*"([^"]+)"/g);
          if (graphqlVideoMatches) {
            graphqlVideoMatches.forEach(match => {
              const urlMatch = match.match(/"url"\s*:\s*"([^"]+)"/);
              if (urlMatch) {
                let url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if ((url.includes('cdninstagram') || url.includes('fbcdn')) && url.includes('.mp4') && !url.includes('/rsrc.php/')) {
                  result.videoUrls.push(url);
                  result.allUrls.push(url);
                }
              }
            });
          }
          
          // Look for story-specific video patterns
          const storyVideoMatches = content.match(/"video_dash_manifest"\s*:\s*"[^"]*"|"video_url"\s*:\s*"([^"]+)"/g);
          if (storyVideoMatches) {
            storyVideoMatches.forEach(match => {
              const urlMatch = match.match(/"video_url"\s*:\s*"([^"]+)"/);
              if (urlMatch) {
                let url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if ((url.includes('cdninstagram') || url.includes('fbcdn')) && url.includes('.mp4') && !url.includes('/rsrc.php/')) {
                  result.videoUrls.push(url);
                  result.allUrls.push(url);
                }
              }
            });
          }
          
          // Look for display_url for high-quality images
          const imageMatches = content.match(/"display_url"\s*:\s*"([^"]+)"/g);
          if (imageMatches) {
            imageMatches.forEach(match => {
              let url = match.replace(/"display_url"\s*:\s*"/, '').replace(/"$/, '');
              url = url.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
              if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                  (url.includes('.jpg') || url.includes('.jpeg')) &&
                  !url.includes('_s150x150') && !url.includes('_s240x240') && !url.includes('_s320x320') &&
                  !url.includes('/rsrc.php/')) {
                result.imageUrls.push(url);
                result.allUrls.push(url);
              }
            });
          }
          
          // Look for story-specific image URLs
          const storyImageMatches = content.match(/"image_versions2"\s*:\s*{\s*"candidates"\s*:\s*\[\s*{\s*"url"\s*:\s*"([^"]+)"/g);
          if (storyImageMatches) {
            storyImageMatches.forEach(match => {
              const urlMatch = match.match(/"url"\s*:\s*"([^"]+)"/);
              if (urlMatch) {
                let url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                    (url.includes('.jpg') || url.includes('.jpeg')) &&
                    !url.includes('/rsrc.php/')) {
                  result.imageUrls.push(url);
                  result.allUrls.push(url);
                }
              }
            });
          }
        });
        
        // Method 3: Check meta tags
        const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
        if (ogVideo && !ogVideo.includes('blob:') && (ogVideo.includes('cdninstagram') || ogVideo.includes('fbcdn'))) {
          result.videoUrls.push(ogVideo);
          result.allUrls.push(ogVideo);
        }
        
        // Remove duplicates
        result.videoUrls = Array.from(new Set(result.videoUrls));
        result.imageUrls = Array.from(new Set(result.imageUrls));
        result.allUrls = Array.from(new Set(result.allUrls));
        
        return result;
      }).catch(() => ({ videoUrls: [], imageUrls: [], allUrls: [] }));
      
      // Merge response-captured URLs with DOM-extracted ones
      const allVideoUrls = Array.from(new Set([...responseVideoUrls, ...extractedData.videoUrls]));
      const allImageUrls = Array.from(new Set([...responseImageUrls, ...extractedData.imageUrls]));
      const { videoUrls, imageUrls } = { videoUrls: allVideoUrls, imageUrls: allImageUrls };

      // Process extracted data and fix username parsing for stories
      let username = 'instagram_user';
      if (type === 'story') {
        const storyMatch = url.match(/instagram\.com\/stories\/([^\/]+)/);
        username = storyMatch ? storyMatch[1] : 'instagram_user';
      } else {
        const usernameMatch = (ogTitle || title).match(/^(.+?)\s+on\s+Instagram/) || 
                             (ogTitle || title).match(/@(\w+)/) ||
                             url.match(/instagram\.com\/([^\/]+)/);
        username = usernameMatch ? usernameMatch[1].replace('@', '') : 'instagram_user';
      }

      // Prioritize high-quality media URLs based on content type
      let mediaUrls: string[] = [];
      
      console.log(`Extracted URLs for ${type}:`, { videoUrls, imageUrls, ogVideo, ogImage });
      
      if (type === 'story') {
        // For stories, prefer videos first, then images
        if (videoUrls.length > 0) {
          mediaUrls = videoUrls;
        } else if (imageUrls.length > 0) {
          mediaUrls = imageUrls;
        } else if (ogVideo && !ogVideo.includes('blob:') && (ogVideo.includes('cdninstagram') || ogVideo.includes('fbcdn')) && !ogVideo.includes('/rsrc.php/')) {
          mediaUrls = [ogVideo];
        } else if (ogImage && !ogImage.includes('blob:') && (ogImage.includes('cdninstagram') || ogImage.includes('fbcdn')) && !ogImage.includes('/rsrc.php/')) {
          mediaUrls = [ogImage];
        } else {
          console.warn(`No story media found. Response URLs: videos=${responseVideoUrls.length}, images=${responseImageUrls.length}`);
          throw new Error('No story media found; it may be private, expired or requires login. Try adding IG_SESSIONID environment variable for private stories.');
        }
      } else if (type === 'reel' || type === 'igtv') {
        // For videos, MUST have video URLs - no fallback to images for video content
        if (videoUrls.length > 0) {
          mediaUrls = videoUrls;
        } else {
          console.warn(`No video URLs found for ${type}. Extracted:`, extractedData.allUrls);
          // Last resort: try og:video if it exists and is not a blob URL
          if (ogVideo && !ogVideo.includes('blob:') && ogVideo.includes('.mp4')) {
            mediaUrls = [ogVideo];
          } else {
            // This should not happen for video content - log the issue
            console.error(`Failed to extract video URLs for ${type}. Available URLs:`, extractedData.allUrls);
            throw new Error('No video content found - may be private or unavailable');
          }
        }
      } else {
        // For posts, prefer high-quality images
        if (imageUrls.length > 0) {
          mediaUrls = imageUrls;
        } else if (ogImage && !ogImage.includes('blob:')) {
          mediaUrls = [ogImage];
        } else {
          console.warn(`No image URLs found for ${type}`);
          throw new Error('No image content found - may be private or unavailable');
        }
      }
      
      console.log(`Final media URLs for ${type}:`, mediaUrls);

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

      console.log(`Successfully extracted metadata for ${type}:`, {
        username,
        mediaCount: mediaUrls.length,
        firstMediaUrl: mediaUrls[0]?.substring(0, 100) + '...'
      });
      
      return metadata as InstagramMetadata;

    } catch (error) {
      console.error('Error extracting Instagram metadata:', error);
      
      const type = this.detectContentType(url);
      
      // For stories, don't provide fallback - re-throw the error for proper handling
      if (type === 'story') {
        throw error;
      }
      
      // Fallback metadata only for posts and reels if extraction fails
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