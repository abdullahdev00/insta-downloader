import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import * as path from 'path';

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


  // Modern Instagram JSON API method
  async extractMetadataFast(url: string): Promise<InstagramMetadata> {
    const contentType = this.detectContentType(url);
    
    try {
      console.log(`Trying modern Instagram JSON API for ${contentType}...`);
      
      // Extract shortcode from URL
      const shortcodeMatch = url.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels?|reel|stories)\/([A-Za-z0-9-_]+)/);
      if (!shortcodeMatch) {
        throw new Error('Could not extract shortcode from URL');
      }
      const shortcode = shortcodeMatch[2];
      
      // Try modern Instagram JSON endpoint first
      let jsonData = null;
      try {
        const jsonResponse = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Instagram 301.0.0.41.111',
            'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Cache-Control': 'no-cache'
          },
          timeout: 10000
        });
        
        if (jsonResponse.data && typeof jsonResponse.data === 'object') {
          jsonData = jsonResponse.data;
          console.log('Successfully extracted JSON data from Instagram API');
        }
      } catch (jsonError) {
        console.log('JSON API failed, falling back to HTML scraping...');
      }
      
      // Process JSON data if available (modern API)
      if (jsonData) {
        const items = jsonData.items || [jsonData];
        const item = items[0] || jsonData;
        
        let username = 'instagram_user';
        let caption = '';
        let thumbnail = '';
        let videoUrls: string[] = [];
        let imageUrls: string[] = [];
        
        // Extract metadata from JSON structure
        if (item.user && item.user.username) {
          username = item.user.username;
        }
        
        if (item.caption && item.caption.text) {
          caption = item.caption.text;
        }
        
        // Extract video URLs from JSON (2024-2025 structure)
        if (item.video_versions && Array.isArray(item.video_versions)) {
          item.video_versions.forEach((version: any) => {
            if (version.url && version.url.includes('.mp4')) {
              videoUrls.push(version.url);
            }
          });
        }
        
        // Extract image URLs from JSON
        if (item.image_versions2 && item.image_versions2.candidates) {
          item.image_versions2.candidates
            .sort((a: any, b: any) => (b.width || 0) - (a.width || 0)) // Sort by width, highest first
            .forEach((candidate: any) => {
              if (candidate.url) {
                imageUrls.push(candidate.url);
              }
            });
        }
        
        // Set thumbnail
        if (imageUrls.length > 0) {
          thumbnail = imageUrls[0];
        } else if (item.image_versions && item.image_versions.candidates && item.image_versions.candidates[0]) {
          thumbnail = item.image_versions.candidates[0].url;
        }
        
        // Determine media URLs based on content type
        let mediaUrls: string[] = [];
        const contentType = this.detectContentType(url);
        if (contentType === 'reel' || contentType === 'igtv') {
          mediaUrls = videoUrls.length > 0 ? videoUrls : [];
        } else {
          mediaUrls = imageUrls.length > 0 ? imageUrls : [];
        }
        
        if (mediaUrls.length > 0) {
          console.log(`JSON API extraction successful! Found ${mediaUrls.length} media URLs`);
          return {
            type: contentType,
            username,
            caption: caption || 'Instagram content',
            thumbnail,
            mediaUrls,
            likes: item.like_count || 0,
            comments: item.comment_count || 0,
            views: item.view_count || (contentType === 'reel' || contentType === 'igtv' ? 0 : undefined),
            duration: contentType === 'reel' || contentType === 'igtv' ? '0:00' : undefined,
            mediaCount: mediaUrls.length
          };
        }
      }
      
      // Fallback to HTML scraping when JSON API fails or no media URLs found
      // Always try HTML scraping if we don't have media URLs yet
      console.log('JSON API failed, falling back to HTML scraping...');
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
        
        // Extract video URLs with multiple patterns (2024-2025 updated)
        const videoPatterns = [
          // Modern Instagram patterns (2024-2025)
          /"video_versions"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /"video_versions"\s*:\s*\[[^\]]*"url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          // Legacy patterns (still in use)
          /"video_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /"src"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          /videoUrl['"']?\s*:\s*['"]([^'"]*\.mp4[^'"]*)['"]?/g,
          /"playback_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g,
          // Additional 2024-2025 patterns
          /"url"\s*:\s*"([^"]*\.mp4[^"]*)"[^}]*"type"\s*:\s*"video"/g,
          /"dash_manifest"\s*:\s*"[^"]*"[^}]*"video_url"\s*:\s*"([^"]*\.mp4[^"]*)"/g
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

        // Extract high-resolution image URLs from display_resources (original aspect ratio)
        const displayResourcesMatches = content.match(/"display_resources"\s*:\s*\[[^\]]*\]/g);
        if (displayResourcesMatches) {
          displayResourcesMatches.forEach(resourcesMatch => {
            // Find all src/config_width pairs within this display_resources array
            const srcMatches = resourcesMatch.match(/"src"\s*:\s*"([^"]+)"[^}]*"config_width"\s*:\s*(\d+)/g);
            if (srcMatches) {
              let bestUrl = '';
              let maxWidth = 0;
              
              srcMatches.forEach(srcMatch => {
                const match = srcMatch.match(/"src"\s*:\s*"([^"]+)"[^}]*"config_width"\s*:\s*(\d+)/);
                if (match) {
                  const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                  const width = parseInt(match[2]);
                  
                  if (width > maxWidth && 
                      (url.includes('cdninstagram') || url.includes('fbcdn')) && 
                      !url.includes('/rsrc.php/') && !url.includes('profile_pic') &&
                      !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                    bestUrl = url;
                    maxWidth = width;
                  }
                }
              });
              
              if (bestUrl) {
                imageUrls.push(bestUrl);
              }
            }
          });
        }
        
        // Extract image URLs from image_versions2.candidates (alternative high-res source)
        const candidatesMatches = content.match(/"image_versions2"\s*:\s*\{\s*"candidates"\s*:\s*\[[^\]]*\]/g);
        if (candidatesMatches) {
          candidatesMatches.forEach(candidatesMatch => {
            const urlMatches = candidatesMatch.match(/"url"\s*:\s*"([^"]+)"[^}]*"width"\s*:\s*(\d+)/g);
            if (urlMatches) {
              let bestUrl = '';
              let maxWidth = 0;
              
              urlMatches.forEach(urlMatch => {
                const match = urlMatch.match(/"url"\s*:\s*"([^"]+)"[^}]*"width"\s*:\s*(\d+)/);
                if (match) {
                  const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                  const width = parseInt(match[2]);
                  
                  if (width > maxWidth && 
                      (url.includes('cdninstagram') || url.includes('fbcdn')) && 
                      !url.includes('/rsrc.php/') && !url.includes('profile_pic') &&
                      !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                    bestUrl = url;
                    maxWidth = width;
                  }
                }
              });
              
              if (bestUrl) {
                imageUrls.push(bestUrl);
              }
            }
          });
        }

      });

      // Deduplicate URLs after all high-resolution extraction
      videoUrls = Array.from(new Set(videoUrls));
      imageUrls = Array.from(new Set(imageUrls));

      // Fallback: Extract image URLs from display_url ONLY if no high-res images found
      if (imageUrls.length === 0) {
        $('script').each((_, script) => {
          const content = $(script).html() || '';
          const imageMatches = content.match(/"display_url"\s*:\s*"([^"]*\.(?:jpg|jpeg|webp)[^"]*)"/g);
          if (imageMatches) {
            imageMatches.forEach(match => {
              const urlMatch = match.match(/"display_url"\s*:\s*"([^"]+)"/);
              if (urlMatch) {
                let mediaUrl = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if ((mediaUrl.includes('cdninstagram') || mediaUrl.includes('fbcdn')) && 
                    !mediaUrl.includes('/rsrc.php/') && !mediaUrl.includes('profile_pic') &&
                    !mediaUrl.includes('dst-jpg_s') && !mediaUrl.includes('t51.2885-19')) {
                  imageUrls.push(mediaUrl);
                }
              }
            });
          }
        });
        // Deduplicate fallback URLs
        imageUrls = Array.from(new Set(imageUrls));
      }

      // Determine final media URLs based on content type
      let mediaUrls: string[] = [];
      
      if (contentType === 'reel' || contentType === 'igtv') {
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
      if (contentType === 'post' && !thumbnail) {
        throw new Error('No thumbnail found for image post');
      }

      return {
        type: contentType,
        username,
        caption: ogDescription || 'Instagram content',
        thumbnail,
        mediaUrls,
        likes: 0,
        comments: 0,
        views: contentType === 'reel' || contentType === 'igtv' ? 0 : undefined,
        duration: contentType === 'reel' || contentType === 'igtv' ? '0:00' : undefined,
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
    if (cached && cached.timestamp && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached metadata for:', normalizedUrl);
      return cached.data;
    }

    const contentType = this.detectContentType(url);
    
    // For stories, always use Puppeteer as they need authentication/session handling
    if (contentType !== 'story') {
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
      if (contentType !== 'story') {
        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
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
      if (contentType === 'story') {
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
      if (contentType === 'story') {
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // For reels/posts, wait for scripts to load
        await page.waitForSelector('script', { timeout: 2000 }).catch(() => {});
      }

      // Extract basic info from page using simple evaluation
      const title = await page.title();
      const ogTitle = await page.$eval('meta[property="og:title"]', (el: any) => el.getAttribute('content')).catch(() => '');
      const ogDescription = await page.$eval('meta[property="og:description"]', (el: any) => el.getAttribute('content')).catch(() => '');
      const ogImage = await page.$eval('meta[property="og:image"]', (el: any) => el.getAttribute('content')).catch(() => '');
      const ogVideo = await page.$eval('meta[property="og:video"]', (el: any) => el.getAttribute('content')).catch(() => '');

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
          
          // High-resolution image extraction from display_resources (original aspect ratio)
          const displayResourcesMatches = content.match(/"display_resources"\s*:\s*\[[^\]]*\]/g);
          if (displayResourcesMatches) {
            displayResourcesMatches.forEach(resourcesMatch => {
              const srcMatches = resourcesMatch.match(/"src"\s*:\s*"([^"]+)"[^}]*"config_width"\s*:\s*(\d+)/g);
              if (srcMatches) {
                let bestUrl = '';
                let maxWidth = 0;
                
                srcMatches.forEach(srcMatch => {
                  const match = srcMatch.match(/"src"\s*:\s*"([^"]+)"[^}]*"config_width"\s*:\s*(\d+)/);
                  if (match) {
                    const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                    const width = parseInt(match[2]);
                    
                    if (width > maxWidth && 
                        (url.includes('cdninstagram') || url.includes('fbcdn')) && 
                        !url.includes('/rsrc.php/') && !url.includes('profile_pic') &&
                        !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                      bestUrl = url;
                      maxWidth = width;
                    }
                  }
                });
                
                if (bestUrl) {
                  result.imageUrls.push(bestUrl);
                  result.allUrls.push(bestUrl);
                }
              }
            });
          }

          
          // Enhanced image extraction from image_versions2.candidates (high-res alternative)
          const candidatesMatches = content.match(/"image_versions2"\s*:\s*\{\s*"candidates"\s*:\s*\[[^\]]*\]/g);
          if (candidatesMatches) {
            candidatesMatches.forEach(candidatesMatch => {
              const urlMatches = candidatesMatch.match(/"url"\s*:\s*"([^"]+)"[^}]*"width"\s*:\s*(\d+)/g);
              if (urlMatches) {
                let bestUrl = '';
                let maxWidth = 0;
                
                urlMatches.forEach(urlMatch => {
                  const match = urlMatch.match(/"url"\s*:\s*"([^"]+)"[^}]*"width"\s*:\s*(\d+)/);
                  if (match) {
                    const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                    const width = parseInt(match[2]);
                    
                    if (width > maxWidth && 
                        (url.includes('cdninstagram') || url.includes('fbcdn')) && 
                        !url.includes('/rsrc.php/') && !url.includes('profile_pic') && 
                        !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                      bestUrl = url;
                      maxWidth = width;
                    }
                  }
                });
                
                if (bestUrl) {
                  result.imageUrls.push(bestUrl);
                  result.allUrls.push(bestUrl);
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
        
        // Fallback: Extract image URLs from display_url ONLY if no high-res images found
        if (result.imageUrls.length === 0) {
          document.querySelectorAll('script').forEach(script => {
            const content = script.textContent || '';
            const imagePattern = /"display_url"\s*:\s*"([^"]*\.(?:jpg|jpeg|webp)[^"]*)"/g;
            let imgMatch;
            while ((imgMatch = imagePattern.exec(content)) !== null) {
              let url = imgMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
              if ((url.includes('cdninstagram') || url.includes('fbcdn')) && 
                  !url.includes('/rsrc.php/') && !url.includes('profile_pic') &&
                  !url.includes('dst-jpg_s') && !url.includes('t51.2885-19')) {
                result.imageUrls.push(url);
                result.allUrls.push(url);
              }
            }
          });
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
      if (contentType === 'story') {
        const storyMatch = url.match(/instagram\.com\/stories\/([^\/]+)/);
        username = storyMatch && storyMatch[1] ? storyMatch[1] : 'instagram_user';
      } else {
        const usernameMatch = (ogTitle || title).match(/^(.+?)\s+on\s+Instagram/) || 
                             (ogTitle || title).match(/@(\w+)/) ||
                             url.match(/instagram\.com\/([^\/]+)/);
        username = usernameMatch ? usernameMatch[1].replace('@', '') : 'instagram_user';
      }

      // Prioritize high-quality media URLs based on content type
      let mediaUrls: string[] = [];
      
      console.log(`Extracted URLs for ${contentType}:`, { videoUrls, imageUrls, ogVideo, ogImage });
      
      if (contentType === 'story') {
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
      } else if (contentType === 'reel' || contentType === 'igtv') {
        // For videos, MUST have video URLs - no fallback to images for video content
        if (videoUrls.length > 0) {
          mediaUrls = videoUrls;
        } else {
          console.warn(`No video URLs found for ${contentType}. Extracted:`, extractedData.allUrls);
          // Last resort: try og:video if it exists and is not a blob URL
          if (ogVideo && !ogVideo.includes('blob:') && ogVideo.includes('.mp4')) {
            mediaUrls = [ogVideo];
          } else {
            // This should not happen for video content - log the issue
            console.error(`Failed to extract video URLs for ${contentType}. Available URLs:`, extractedData.allUrls);
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
          console.warn(`No image URLs found for ${contentType}`);
          throw new Error('No image content found - may be private or unavailable');
        }
      }
      
      console.log(`Final media URLs for ${contentType}:`, mediaUrls);

      // Set thumbnail with fallbacks for Puppeteer path too
      let thumbnail = ogImage || (imageUrls.length > 0 ? imageUrls[0] : '');
      
      // Only require thumbnail for image posts, not for videos
      if (contentType === 'post' && !thumbnail) {
        throw new Error('No thumbnail found for image post');
      }

      const metadata = {
        type: contentType,
        username,
        caption: ogDescription || 'Instagram content',
        thumbnail,
        mediaUrls,
        likes: 0,
        comments: 0,
        views: contentType === 'reel' || contentType === 'igtv' ? 0 : undefined,
        duration: contentType === 'reel' || contentType === 'igtv' ? '0:00' : undefined,
        mediaCount: mediaUrls.length
      };

      console.log(`Successfully extracted metadata for ${contentType}:`, {
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