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

      const metadata = await instagramService.extractMetadata(url);
      res.json(metadata);
      
    } catch (error) {
      console.error("Error extracting metadata:", error);
      res.status(500).json({ error: "Failed to extract content metadata" });
    }
  });

  // Background processing function
  async function processDownload(downloadId: string, url: string) {
    try {
      await storage.updateDownload(downloadId, { status: 'processing' });
      
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
      
    } catch (error) {
      console.error("Error processing download:", error);
      await storage.updateDownload(downloadId, { status: 'failed' });
    }
  }

  const httpServer = createServer(app);

  return httpServer;
}
