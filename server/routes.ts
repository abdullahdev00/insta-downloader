import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { instagramService } from "./services/instagram";
import { insertDownloadSchema } from "@shared/schema";
import { z } from "zod";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Add defensive middleware for API routes to ensure JSON responses
  app.use('/api/*', (req, res, next) => {
    // Set content type to JSON for all API routes
    res.setHeader('Content-Type', 'application/json');
    
    // Override res.send to ensure we never accidentally send HTML
    const originalSend = res.send;
    res.send = function(data) {
      if (typeof data === 'string' && data.startsWith('<!DOCTYPE html>')) {
        console.error(`Attempted to send HTML response to API route: ${req.path}`);
        return originalSend.call(this, JSON.stringify({ error: 'Internal server error' }));
      }
      return originalSend.call(this, data);
    };
    
    next();
  });

  // Instagram URL processing endpoint
  app.post("/api/instagram/process", async (req, res) => {
    try {
      const { url, type } = insertDownloadSchema.parse(req.body);
      
      if (!instagramService.validateInstagramUrl(url)) {
        return res.status(400).json({ error: "Invalid Instagram URL" });
      }

      // Create download record
      const download = await storage.createDownload({ url, type });
      
      // Start processing in background
      processDownload(download.id, url).catch(console.error);
      
      res.json({ 
        success: true, 
        downloadId: download.id,
        message: "Processing started" 
      });
      
    } catch (error) {
      console.error("Error processing Instagram URL:", error);
      res.status(400).json({ error: "Invalid request data" });
    }
  });

  // Get download status
  app.get("/api/downloads/:id", async (req, res) => {
    try {
      const download = await storage.getDownload(req.params.id);
      if (!download) {
        return res.status(404).json({ error: "Download not found" });
      }
      res.json(download);
    } catch (error) {
      console.error("Error getting download:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get recent downloads
  app.get("/api/downloads", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const downloads = await storage.getRecentDownloads(limit);
      res.json(downloads);
    } catch (error) {
      console.error("Error getting downloads:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve download files
  app.get("/api/downloads/:id/file", async (req, res) => {
    try {
      const download = await storage.getDownload(req.params.id);
      if (!download || !download.filePath) {
        return res.status(404).json({ error: "File not found" });
      }

      const filename = path.basename(download.filePath);
      const fileExtension = path.extname(filename).toLowerCase();
      
      // Sanitize filename for HTTP header - remove or replace problematic characters
      const sanitizedFilename = filename
        .replace(/[^\w\-_\. ]/g, '_') // Replace non-alphanumeric chars (except dash, underscore, dot, space) with underscore
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 100); // Limit length to prevent issues
      
      // Set proper content type based on file extension
      let contentType = 'application/octet-stream';
      if (fileExtension === '.mp4') {
        contentType = 'video/mp4';
      } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (fileExtension === '.png') {
        contentType = 'image/png';
      }
      
      // Set proper headers for all devices, especially mobile
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // For mobile devices, ensure proper content length
      const fs = await import('fs/promises');
      const stats = await fs.stat(download.filePath);
      res.setHeader('Content-Length', stats.size.toString());
      
      res.download(download.filePath, filename);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Instagram metadata extraction (for preview)
  app.post("/api/instagram/preview", async (req, res) => {
    try {
      const { url } = z.object({ url: z.string() }).parse(req.body);
      
      if (!instagramService.validateInstagramUrl(url)) {
        return res.status(400).json({ error: "Invalid Instagram URL" });
      }

      const contentType = instagramService.detectContentType(url);
      
      try {
        const metadata = await instagramService.extractMetadata(url);
        res.json(metadata);
      } catch (extractionError: any) {
        console.error("Error extracting metadata:", extractionError);
        
        // Handle story-specific errors with actionable messages
        if (contentType === 'story') {
          if (extractionError.message && extractionError.message.includes('private')) {
            return res.status(422).json({ 
              error: "This story appears to be private or expired. Stories are only visible to followers and disappear after 24 hours. For private stories, you may need to add an IG_SESSIONID environment variable with your Instagram session cookie." 
            });
          } else if (extractionError.message && extractionError.message.includes('login')) {
            return res.status(422).json({ 
              error: "This story requires authentication. Add an IG_SESSIONID environment variable with your Instagram session cookie to access private stories." 
            });
          } else {
            return res.status(422).json({ 
              error: "Unable to extract story content. Stories may be private, expired (24h limit), or require authentication. Try adding IG_SESSIONID environment variable for private stories." 
            });
          }
        }
        
        // For non-story content, return generic error
        res.status(500).json({ error: "Failed to extract content metadata" });
      }
      
    } catch (error) {
      console.error("Error in preview endpoint:", error);
      res.status(400).json({ error: "Invalid request data" });
    }
  });

  // Background processing function
  async function processDownload(downloadId: string, url: string) {
    try {
      await storage.updateDownload(downloadId, { status: 'processing' });
      
      const contentType = instagramService.detectContentType(url);
      
      // Extract metadata
      const metadata = await instagramService.extractMetadata(url);
      
      await storage.updateDownload(downloadId, { 
        metadata: metadata as any,
        status: 'processing'
      });

      // Download the first media file
      if (metadata.mediaUrls.length > 0) {
        const filename = instagramService.generateFilename(metadata);
        const { filePath, fileSize } = await instagramService.downloadMedia(
          metadata.mediaUrls[0], 
          filename
        );
        
        await storage.updateDownload(downloadId, {
          status: 'completed',
          filePath,
          fileSize,
          downloadedAt: new Date()
        });
      } else {
        await storage.updateDownload(downloadId, { status: 'failed' });
      }
      
    } catch (error: any) {
      console.error("Error processing download:", error);
      
      // For stories, just mark as failed (detailed error already logged)
      await storage.updateDownload(downloadId, { status: 'failed' });
    }
  }

  const httpServer = createServer(app);

  return httpServer;
}
