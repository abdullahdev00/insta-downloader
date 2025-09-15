import { type User, type InsertUser, type Download, type InsertDownload } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createDownload(download: InsertDownload): Promise<Download>;
  getDownload(id: string): Promise<Download | undefined>;
  updateDownload(id: string, updates: Partial<Download>): Promise<Download | undefined>;
  getRecentDownloads(limit?: number): Promise<Download[]>;
  deleteDownload(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private downloads: Map<string, Download>;

  constructor() {
    this.users = new Map();
    this.downloads = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createDownload(insertDownload: InsertDownload): Promise<Download> {
    const id = randomUUID();
    const download: Download = {
      ...insertDownload,
      id,
      status: 'pending',
      metadata: null,
      filePath: null,
      fileSize: null,
      downloadedAt: null,
      createdAt: new Date(),
    };
    this.downloads.set(id, download);
    return download;
  }

  async getDownload(id: string): Promise<Download | undefined> {
    return this.downloads.get(id);
  }

  async updateDownload(id: string, updates: Partial<Download>): Promise<Download | undefined> {
    const existing = this.downloads.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.downloads.set(id, updated);
    return updated;
  }

  async getRecentDownloads(limit: number = 50): Promise<Download[]> {
    return Array.from(this.downloads.values())
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  async deleteDownload(id: string): Promise<boolean> {
    return this.downloads.delete(id);
  }
}

export const storage = new MemStorage();
