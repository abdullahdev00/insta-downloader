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
  private cache = new Map<string, { data: InstagramMetadata; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  async initBrowser() {
    try {
      // Reuse existing browser if still connected
      if (this.browser && this.browser.isConnected()) {
        return this.browser;
      }

      // Close old browser if exists but disconnected
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      console.log('Launching new browser instance...');
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
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
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

  // Normalize URL for better cache hits
  private normalizeUrl(url: string): string {
    const urlObj = new URL(url);
    // Remove tracking parameters
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    urlObj.searchParams.delete('igshid');
    urlObj.searchParams.delete('hl');
    return urlObj.toString();
  }


  // Fast HTML-first extraction method
  async extractMetadataFast(url: string): Promise<InstagramMetadata> {
    const type = this.detectContentType(url);
    
    try {
      console.log(`Trying fast HTML extraction for ${type}...`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Instagram 301.0.0.41.111',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract basic metadata
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const ogDescription = $('meta[property="og:description"]').attr('content') || '';
      const ogImage = $('meta[property="og:image"]').attr('content') || '';
      const ogVideo = $('meta[property="og:video"]').attr('content') || '';

      // Parse username
      let username = 'instagram_user';
      const usernameMatch = (ogTitle).match(/^(.+?)\s+on\s+Instagram/) || 
                           (ogTitle).match(/@(\w+)/) ||
                           url.match(/instagram\.com\/([^\/]+)/);
      username = usernameMatch ? usernameMatch[1].replace('@', '') : 'instagram_user';

      // Extract media URLs from script tags
      let videoUrls: string[] = [];
      let imageUrls: string[] = [];

      $('script').each((_, script) => {
        const content = $(script).html() || '';
        
        // Extract video URLs with multiple patterns
        const videoPatterns = [
          /"video_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /"src"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /videoUrl['"']?\s*:\s*['"]([^'"]*\.mp4[^'"]*)['"]?/g,
          /"video_versions"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /"playback_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g
        ];
        
        videoPatterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const urlMatch = match.match(/"(?:video_url|src|url|playback_url)"\s*:\s*"([^"]+)"|videoUrl['"']?\s*:\s*['"]([^'"]+)['"]?/);
              if (urlMatch) {
                let mediaUrl = (urlMatch[1] || urlMatch[2]).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if ((mediaUrl.includes('cdninstagram') || mediaUrl.includes('fbcdn')) && 
                    !mediaUrl.includes('/rsrc.php/') && 
                    mediaUrl.includes('.mp4')) {
                  videoUrls.push(mediaUrl);
                }
              }
            });
          }
        });

        // Extract image URLs
        const imageMatches = content.match(/"display_url"\s*:\s*"([^"]*\.(?:jpg|jpeg)[^"]*)"/g);
        if (imageMatches) {
          imageMatches.forEach(match => {
            const urlMatch = match.match(/"display_url"\s*:\s*"([^"]+)"/);
            if (urlMatch) {
              let mediaUrl = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
              if ((mediaUrl.includes('cdninstagram') || mediaUrl.includes('fbcdn')) && !mediaUrl.includes('/rsrc.php/')) {
                imageUrls.push(mediaUrl);
              }
            }
          });
        }
      });

      // Determine final media URLs based on content type
      let mediaUrls: string[] = [];
      
      if (type === 'reel' || type === 'igtv') {
        if (videoUrls.length > 0) {
          mediaUrls = videoUrls;
        } else if (ogVideo && ogVideo.includes('.mp4')) {
          mediaUrls = [ogVideo];
        } else {
          throw new Error('No video content found in fast extraction');
        }
      } else {
        if (imageUrls.length > 0) {
          mediaUrls = imageUrls;
        } else if (ogImage) {
          mediaUrls = [ogImage];
        } else {
          throw new Error('No image content found in fast extraction');
        }
      }

      console.log(`Fast extraction successful! Found ${mediaUrls.length} media URLs`);

      // Set thumbnail with fallbacks
      let thumbnail = ogImage || (imageUrls.length > 0 ? imageUrls[0] : '');
      
      // Only require thumbnail for image posts (posts), not for videos (reels/igtv)
      if (type === 'post' && !thumbnail) {
        throw new Error('No thumbnail found for image post');
      }

      return {
        type,
        username,
        caption: ogDescription || 'Instagram content',
        thumbnail,
        mediaUrls,
        likes: 0,
        comments: 0,
        views: type === 'reel' || type === 'igtv' ? 0 : undefined,
        duration: type === 'reel' || type === 'igtv' ? '0:00' : undefined,
        mediaCount: mediaUrls.length
      };

    } catch (error: any) {
      console.log('Fast extraction failed, falling back to Puppeteer:', error.message);
      throw error; // Will trigger Puppeteer fallback
    }
  }

  async extractMetadata(url: string): Promise<InstagramMetadata> {
    if (!this.validateInstagramUrl(url)) {
      throw new Error('Invalid Instagram URL');
    }

    // Normalize URL for better cache hits
    const normalizedUrl = this.normalizeUrl(url);
    const cacheKey = normalizedUrl;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached metadata for:', normalizedUrl);
      return cached.data;
    }

    const type = this.detectContentType(url);
    
    // For stories, always use Puppeteer as they need authentication/session handling
    if (type !== 'story') {
      try {
        const fastResult = await this.extractMetadataFast(url);
        
        // Cache the successful result
        this.cache.set(cacheKey, { 
          data: fastResult, 
          timestamp: Date.now() 
        });
        
        return fastResult;
      } catch (error) {
        console.log('Fast extraction failed, falling back to Puppeteer method...');
      }
    }

    // Puppeteer fallback for stories or when fast method fails
    let browser = null;
    let page = null;

    try {
      browser = await this.initBrowser();
      page = await browser.newPage();

      // Block unnecessary resources for faster loading (except for stories)
      if (type !== 'story') {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          const url = req.url();
          
          // Allow only essential resources
          if (resourceType === 'document' || resourceType === 'script' || 
              resourceType === 'xhr' || resourceType === 'fetch') {
            req.continue();
          } else {
            req.abort();
          }
        });
      }

      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Instagram 301.0.0.41.111');
      
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
      } else {
        // Use mobile site for all content types for faster loading
        url = url.replace('www.instagram.com', 'm.instagram.com');
      }
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 6000 });
      
      // Wait for essential content only, no fixed delays
      if (type === 'story') {
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // For reels/posts, wait for scripts to load
        await page.waitForSelector('script', { timeout: 2000 }).catch(() => {});
      }

      // Extract basic info from page using simple evaluation
      const title = await page.title();
      const ogTitle = await page.$eval('meta[property="og:title"]', el => el.getAttribute('content')).catch(() => '');
      const ogDescription = await page.$eval('meta[property="og:description"]', el => el.getAttribute('content')).catch(() => '');
      const ogImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute('content')).catch(() => '');
      const ogVideo = await page.$eval('meta[property="og:video"]', el => el.getAttribute('content')).catch(() => '');

      // Request interception remains active for resource blocking
      
      // Immediate content extraction without additional waits
      await page.waitForSelector('script', { timeout: 1000 }).catch(() => {});
      
      // Extract media URLs using streamlined methods
      const extractedData = await page.evaluate(() => {
        const result = {
          videoUrls: [] as string[],
          imageUrls: [] as string[],
          allUrls: [] as string[]
        };
        
        // Method 1: Quick video element check
        document.querySelectorAll('video, source').forEach(element => {
          const src = element.getAttribute('src');
          if (src && (src.includes('cdninstagram') || src.includes('fbcdn')) && src.includes('.mp4')) {
            result.videoUrls.push(src);
            result.allUrls.push(src);
          }
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
        
        // Method 2: Streamlined script parsing
        document.querySelectorAll('script').forEach(script => {
          const content = script.textContent || '';
          
          // Quick video URL extraction
          const videoPattern = /"video_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g;
          let match;
          while ((match = videoPattern.exec(content)) !== null) {
            let url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            if ((url.includes('cdninstagram') || url.includes('fbcdn')) && !url.includes('/rsrc.php/')) {
              result.videoUrls.push(url);
              result.allUrls.push(url);
            }
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
          
          // Quick image URL extraction
          const imagePattern = /"display_url"\s*:\s*"([^"]*\.(?:jpg|jpeg)[^"]*)"/g;
          let imgMatch;
          while ((imgMatch = imagePattern.exec(content)) !== null) {
            let url = imgMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                !url.includes('/rsrc.php/') && !url.includes('profile_pic')) {
              result.imageUrls.push(url);
              result.allUrls.push(url);
            }
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
                    !url.includes('/rsrc.php/') && !url.includes('profile_pic') && 
                    !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                  result.imageUrls.push(url);
                  result.allUrls.push(url);
                }
              }
            });
          }
          
          // Look for story-specific media patterns
          const storyMediaMatches = content.match(/"media"\s*:\s*{\s*"image_versions2"|"media"\s*:\s*{\s*"video_versions"/g);
          if (storyMediaMatches) {
            // Look for story media URLs in the media object
            const mediaUrlMatches = content.match(/"media"\s*:\s*{[^}]*"(?:image_versions2|video_versions)"\s*:\s*\[[^]]*"url"\s*:\s*"([^"]+)"/g);
            if (mediaUrlMatches) {
              mediaUrlMatches.forEach(match => {
                const urlMatch = match.match(/"url"\s*:\s*"([^"]+)"/);
                if (urlMatch) {
                  let url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                  if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                      (url.includes('.mp4') || url.includes('.jpg') || url.includes('.jpeg')) &&
                      !url.includes('/rsrc.php/') && !url.includes('profile_pic') && 
                      !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                    if (url.includes('.mp4')) {
                      result.videoUrls.push(url);
                    } else {
                      result.imageUrls.push(url);
                    }
                    result.allUrls.push(url);
                  }
                }
              });
            }
          }
          
          // Look for story-specific GraphQL patterns
          const storyGraphQLMatches = content.match(/"stories"\s*:\s*\[[^]]*"media"\s*:\s*{[^}]*"(?:image_versions2|video_versions)"/g);
          if (storyGraphQLMatches) {
            const graphQLUrlMatches = content.match(/"stories"[^{]*{[^}]*"url"\s*:\s*"([^"]+)"/g);
            if (graphQLUrlMatches) {
              graphQLUrlMatches.forEach(match => {
                const urlMatch = match.match(/"url"\s*:\s*"([^"]+)"/);
                if (urlMatch) {
                  let url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                  if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                      (url.includes('.mp4') || url.includes('.jpg') || url.includes('.jpeg')) &&
                      !url.includes('/rsrc.php/') && !url.includes('profile_pic') && 
                      !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                    if (url.includes('.mp4')) {
                      result.videoUrls.push(url);
                    } else {
                      result.imageUrls.push(url);
                    }
                    result.allUrls.push(url);
                  }
                }
              });
            }
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
      
      // Use DOM-extracted URLs directly
      const { videoUrls, imageUrls } = extractedData;

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
          console.warn(`No story media found. Extracted URLs: videos=${videoUrls.length}, images=${imageUrls.length}`);
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

      // Set thumbnail with fallbacks for Puppeteer path too
      let thumbnail = ogImage || (imageUrls.length > 0 ? imageUrls[0] : '');
      
      // Only require thumbnail for image posts, not for videos
      if (type === 'post' && !thumbnail) {
        throw new Error('No thumbnail found for image post');
      }

      const metadata = {
        type,
        username,
        caption: ogDescription || 'Instagram content',
        thumbnail,
        mediaUrls,
        likes: 0,
        comments: 0,
        views: type === 'reel' || type === 'igtv' ? 0 : undefined,
        duration: type === 'reel' || type === 'igtv' ? '0:00' : undefined,
        mediaCount: mediaUrls.length
      };

      console.log(`Successfully extracted metadata for ${type}:`, {
        username,
        mediaCount: mediaUrls.length,
        firstMediaUrl: mediaUrls[0]?.substring(0, 100) + '...'
      });

      // Cache the successful result
      this.cache.set(cacheKey, { 
        data: metadata as InstagramMetadata, 
        timestamp: Date.now() 
      });
      
      return metadata as InstagramMetadata;

    } catch (error: any) {
      console.error('Error extracting Instagram metadata:', error);
      
      const type = this.detectContentType(url);
      
      // Don't provide fallback mock data - throw error for proper handling
      throw new Error(`Failed to extract Instagram content: ${error.message}`);
    } finally {
      // Only close the page, keep browser persistent for reuse
      try {
        if (page) await page.close();
        // Don't close the browser - keep it for reuse!
      } catch (closeError) {
        console.error('Error closing page:', closeError);
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