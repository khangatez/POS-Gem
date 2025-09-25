

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- SQL.js SETUP & DB HELPERS ---
declare const initSqlJs: any;
declare const html2pdf: any;
const DB_NAME_IDB = 'pos_gem_app_idb';
const DB_STORE_NAME = 'sqlite_db_store';
const DB_FILE_KEY = 'db_file';

let db: any = null;

const initDb = async () => {
    try {
        const SQL = await initSqlJs({
            locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });
        // FIX: Replaced incorrect type UintArray with Uint8Array.
        const dbFile: Uint8Array | null = await getDbFromIndexedDB();
        db = dbFile ? new SQL.Database(dbFile) : new SQL.Database();
        // Ensure schema exists on every load
        createSchema();
        return db;
    } catch (err) {
        console.error("Database initialization failed:", err);
        throw err;
    }
};

const saveDbToIndexedDB = async () => {
    if (!db) return;
    const data = db.export();
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME_IDB, 1);
        request.onupgradeneeded = (event) => {
            const idb = (event.target as any).result;
            if (!idb.objectStoreNames.contains(DB_STORE_NAME)) {
                idb.createObjectStore(DB_STORE_NAME);
            }
        };
        request.onsuccess = (event) => {
            const idb = (event.target as any).result;
            const transaction = idb.transaction(DB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DB_STORE_NAME);
            store.put(data, DB_FILE_KEY);
            transaction.oncomplete = () => {
                idb.close();
                resolve();
            };
            transaction.onerror = (err: any) => reject(err);
        };
        request.onerror = (event) => reject((event.target as any).error);
    });
};

// FIX: Replaced incorrect return type UintArray with Uint8Array.
const getDbFromIndexedDB = (): Promise<Uint8Array | null> => {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME_IDB, 1);
        request.onupgradeneeded = (event) => {
            const idb = (event.target as any).result;
            if (!idb.objectStoreNames.contains(DB_STORE_NAME)) {
                idb.createObjectStore(DB_STORE_NAME);
            }
        };
        request.onsuccess = (event) => {
            const idb = (event.target as any).result;
            if (!idb.objectStoreNames.contains(DB_STORE_NAME)) {
                idb.close();
                return resolve(null);
            }
            const transaction = idb.transaction(DB_STORE_NAME, 'readonly');
            const store = transaction.objectStore(DB_STORE_NAME);
            const getRequest = store.get(DB_FILE_KEY);
            getRequest.onsuccess = () => resolve(getRequest.result || null);
            getRequest.onerror = () => resolve(null);
            transaction.oncomplete = () => idb.close();
        };
        request.onerror = () => resolve(null);
    });
};

const createSchema = () => {
    if (!db) return;
    const schema = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL, -- 'super_admin', 'shop_admin', 'cashier'
            shop_id INTEGER,
            FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            nextProductId INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER NOT NULL,
            shop_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            descriptionTamil TEXT,
            barcode TEXT,
            b2bPrice REAL NOT NULL,
            b2cPrice REAL NOT NULL,
            stock REAL NOT NULL,
            category TEXT,
            hsnCode TEXT,
            PRIMARY KEY (id, shop_id)
        );
        CREATE TABLE IF NOT EXISTS sales_history (
            id TEXT PRIMARY KEY,
            shop_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            subtotal REAL NOT NULL,
            discount REAL NOT NULL,
            tax REAL NOT NULL,
            total REAL NOT NULL,
            paid_amount REAL NOT NULL DEFAULT 0,
            balance_due REAL NOT NULL DEFAULT 0,
            customerName TEXT,
            customerMobile TEXT
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id TEXT NOT NULL,
            productId INTEGER NOT NULL,
            shop_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            descriptionTamil TEXT,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            isReturn INTEGER NOT NULL,
            hsnCode TEXT
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mobile TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS payment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id TEXT NOT NULL,
            date TEXT NOT NULL,
            amount_paid REAL NOT NULL,
            payment_method TEXT,
            FOREIGN KEY (sale_id) REFERENCES sales_history(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            amount REAL NOT NULL,
            FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );
    `;
    db.exec(schema);
};

const sqlResultToObjects = (result: any) => {
    if (!result || result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row: any[]) => {
        const obj: { [key: string]: any } = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
};

// --- AUTH UTILITIES ---
const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // FIX: Replaced incorrect type UintArray with Uint8Array. This resolves the reported 'Cannot find name' error and likely the subsequent 'Expected 0 arguments' error as well.
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- TYPE DEFINITIONS ---
type UserRole = 'super_admin' | 'shop_admin' | 'cashier';

interface User {
    id: number;
    username: string;
    role: UserRole;
    shop_id: number | null;
}

interface SaleItem {
  id: number;
  productId: number;
  description: string;
  descriptionTamil?: string;
  quantity: number;
  price: number;
  isReturn: boolean;
  hsnCode?: string;
}

interface Product {
  id: number;
  description: string;
  descriptionTamil?: string;
  barcode: string;
  b2bPrice: number;
  b2cPrice: number;
  stock: number;
  category?: string;
  hsnCode?: string;
}

interface SaleRecord {
    id: string;
    date: string; // ISO string
    items: SaleItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid_amount: number;
    balance_due: number;
    customerName?: string;
    customerMobile?: string;
    previousBalanceForPreview?: number;
    isFinalized?: boolean;
}

interface Payment {
    id: number;
    sale_id: string;
    date: string;
    amount_paid: number;
    payment_method: string;
}


interface Customer {
    id: number;
    name: string;
    mobile: string;
}

interface Expense {
    id: number;
    shop_id: number;
    date: string; // ISO string
    description: string;
    category?: string;
    amount: number;
}

interface Shop {
    id: number;
    name: string;
    products: Product[];
    salesHistory: SaleRecord[];
    expenses: Expense[];
    nextProductId: number;
}

type UserPlan = 'free' | 'pro';

// FIX: Added the missing 'styles' object definition to resolve all 'Cannot find name: styles' errors.
const styles: { [key: string]: React.CSSProperties } = {
    // General & Layout
    appContainer: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        backgroundColor: 'var(--background-color)',
        color: 'var(--text-color)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        backgroundColor: 'var(--surface-color)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
    },
    mainContent: {
        flex: 1,
        overflow: 'auto',
        padding: '1.5rem',
    },
    title: {
        margin: 0,
        fontSize: '1.5rem',
        color: 'var(--primary-color)',
    },
    viewContainer: {
        backgroundColor: 'var(--surface-color)',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    },
    viewHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
    },

    // Modals
    modalBackdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: 'var(--surface-color)',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
    },
    modalActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        marginTop: '1.5rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--border-color)',
    },

    // Forms & Inputs
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: 500,
        color: 'var(--secondary-color)',
    },
    input: {
        width: '100%',
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        backgroundColor: 'var(--background-color)',
        color: 'var(--text-color)',
        boxSizing: 'border-box',
    },
    button: {
        padding: '0.75rem 1.25rem',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: 'bold',
        transition: 'background-color 0.2s, box-shadow 0.2s',
    },
    actionButton: {
        padding: '0.25rem 0.75rem',
        border: 'none',
        borderRadius: '6px',
        color: 'white',
        cursor: 'pointer',
        fontSize: '0.8rem',
    },

    // Tables
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.95rem',
    },
    th: {
        padding: '0.75rem 1rem',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
    },
    td: {
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-color)',
    },
    gridInput: {
        width: '80px',
        padding: '0.25rem',
        fontSize: '0.9rem',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
    },
    wideGridInput: {
        width: '95%',
        padding: '0.25rem',
        fontSize: '0.9rem',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        backgroundColor: 'transparent',
    },
    emptyMessage: {
        textAlign: 'center',
        padding: '2rem',
        color: 'var(--secondary-color)',
    },

    // Specific Components
    productForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    confirmationDetails: {
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        marginBottom: '1.5rem',
    },
    confirmationRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.25rem 0',
    },
    proBadge: {
        position: 'absolute',
        top: '-8px',
        right: '-12px',
        backgroundColor: '#ffc107',
        color: 'black',
        padding: '2px 6px',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        border: '1px solid white',
    },
    proBadgeSmall: {
        position: 'absolute',
        bottom: '-8px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '0.7rem',
        whiteSpace: 'nowrap',
    },
    proBadgeLarge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#ffc107',
        color: 'black',
        padding: '0.25rem 0.75rem',
        borderRadius: '0 8px 0 8px',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        cursor: 'pointer',
    },
    
    // Settings View
    settingsCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    checkboxGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },

    // Customer View
    customerViewLayout: {
        display: 'flex',
        gap: '1.5rem',
        height: 'calc(100vh - 200px)',
    },
    customerListPanel: {
        flex: '1 1 300px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
    },
    customerDetailPanel: {
        flex: '2 1 600px',
        padding: '1rem',
    },
    customerListItem: {
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
    },
    customerListItemActive: {
        backgroundColor: 'var(--primary-color-light)',
        fontWeight: 'bold',
        color: 'var(--primary-color)',
    },
    customerDetailHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '1rem',
        marginBottom: '1rem',
    },
    purchaseHistoryItem: {
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
    },
    dueTag: {
        backgroundColor: 'var(--danger-color)',
        color: 'white',
        padding: '0.2rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 'bold',
    },

    // Reports View
    reportFilters: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
    },
    dateRangePicker: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    reportTabs: {
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
    },
    reportTabButton: {
        padding: '0.75rem 1.5rem',
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        fontSize: '1rem',
        color: 'var(--secondary-color)',
        position: 'relative',
    },
    reportTabButtonActive: {
        color: 'var(--primary-color)',
        borderBottom: '3px solid var(--primary-color)',
        fontWeight: 'bold',
    },
    reportSummary: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '1.5rem',
    },
    summaryCard: {
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        textAlign: 'center',
        border: '1px solid var(--border-color)',
    },

    // Sales View
    priceModeSelector: {
        display: 'flex',
        backgroundColor: '#e9ecef',
        borderRadius: '8px',
        padding: '4px',
    },
    priceModeLabel: {
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    priceModeLabelChecked: {
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        color: 'var(--primary-color)',
        fontWeight: 500,
    },
    priceModeLabel_input: {
        display: 'none',
    },
    customerSection: {
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
    },
    customerInput: {
        flex: 2,
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
    },
    countryCodeInput: {
        flex: '0 0 70px',
        padding: '0.75rem',
        borderRadius: '8px 0 0 8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        textAlign: 'center',
    },
    mobileNumberInput: {
        flex: 1,
        padding: '0.75rem',
        borderRadius: '0 8px 8px 0',
        border: '1px solid var(--border-color)',
        borderLeft: 'none',
        fontSize: '1rem',
    },
    barcodeScanButton: {
        position: 'absolute',
        right: '45px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    voiceSearchButton: {
        position: 'absolute',
        right: '5px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    searchResults: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '0 0 8px 8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        listStyle: 'none',
        padding: 0,
        margin: 0,
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: 100,
    },
    searchResultItem: {
        padding: '0.75rem 1rem',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-color)',
    },
    highlighted: {
        backgroundColor: 'var(--primary-color-light)',
    },
    totalsSection: {
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '1.5rem',
        marginTop: '1.5rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--border-color)',
    },
    totalsInput: {
        width: '120px',
        padding: '0.5rem',
        textAlign: 'right',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
    },
    grandTotal: {
        textAlign: 'right',
        paddingLeft: '1.5rem',
        borderLeft: '1px solid var(--border-color)',
    },
    backupSection: {
        marginTop: '2rem',
        padding: '1.5rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
    },
    backupTitle: {
        marginTop: 0,
    },
    backupDescription: {
        color: 'var(--secondary-color)',
        maxWidth: '700px',
    },
    backupActions: {
        display: 'flex',
        gap: '1rem',
        marginTop: '1rem',
    },

    // Mobile Sales View specific
    mobileSingleColumnLayout: {
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 70px)', // Adjust for header height
    },
    mobileScrollableContent: {
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
    },
    mobileBottomActionBar: {
        flexShrink: 0,
        padding: '1rem',
        backgroundColor: 'var(--surface-color)',
        borderTop: '1px solid var(--border-color)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
    },
    mobileFinalizeButton: {
        width: '100%',
        padding: '1rem',
        fontSize: '1.1rem',
        backgroundColor: 'var(--success-color)',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 'bold',
    },
    mobileSection: {
        marginBottom: '1.5rem',
    },
    mobileSectionTitle: {
        marginTop: 0,
        marginBottom: '1rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.5rem',
    },
    mobileSettingsGroup: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
    },
    mobileSettingsLabel: {
        margin: 0,
    },
    mobileInput: {
        width: '100%',
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        boxSizing: 'border-box',
    },
    mobileInputIconButton: {
        position: 'absolute',
        right: '5px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    mobileButton: {
        width: '100%',
        padding: '0.75rem',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        cursor: 'pointer',
    },
    mobileInlineSearchResults: {
        listStyle: 'none',
        padding: '0.5rem 0 0 0',
        margin: 0,
    },
    mobileInlineSearchResultItem: {
        padding: '0.75rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        marginBottom: '0.5rem',
        cursor: 'pointer',
    },
    mobileBillItemCard: {
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        backgroundColor: 'white',
    },
    mobileBillItemCardReturn: {
        backgroundColor: '#ffebee',
        borderColor: 'var(--danger-color)',
    },
    mobileBillItemInfo: {
        marginBottom: '0.75rem',
    },
    mobileBillItemControls: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    mobileQuantityControls: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
    },
    mobileRoundButton: {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        border: '1px solid var(--border-color)',
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    mobilePaymentRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 0',
    },
    mobilePaymentInput: {
        width: '100px',
        textAlign: 'right',
        padding: '0.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
    },
    mobileGrandTotal: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 0',
        fontWeight: 'bold',
        fontSize: '1.2rem',
    },

    // Shop Manager
    shopListItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
    },
    shopListItemActive: {
        backgroundColor: 'var(--primary-color-light)',
        fontWeight: 'bold',
        borderLeft: '4px solid var(--primary-color)',
        paddingLeft: 'calc(1rem - 4px)',
    },
    
    // Dropdown Nav
    dropdownContainer: {
        position: 'relative',
    },
    dropdownButton: {
        padding: '0.5rem 1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        backgroundColor: 'var(--surface-color)',
        cursor: 'pointer',
        fontSize: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    dropdownMenu: {
        position: 'absolute',
        top: '110%',
        right: 0,
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        listStyle: 'none',
        padding: '0.5rem 0',
        margin: 0,
        zIndex: 10,
        width: '200px',
    },
    dropdownMenuItem: {
        padding: '0.75rem 1.25rem',
        cursor: 'pointer',
    },
    dropdownMenuItemActive: {
        backgroundColor: 'var(--primary-color-light)',
        fontWeight: 'bold',
        color: 'var(--primary-color)',
    },
    shopManagerButton: {
        padding: '0.5rem 1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        backgroundColor: 'var(--surface-color)',
        cursor: 'pointer',
        fontSize: '1rem',
    },
    logoutButton: {
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: 'var(--secondary-color)',
        color: 'white',
        cursor: 'pointer',
        fontSize: '1rem',
    },
};

// --- PRODUCT FORM MODAL COMPONENT ---
const ProductFormModal = ({ product, onSave, onUpdate, onClose }: { product: Product | null, onSave: (product: Omit<Product, 'id'>) => void, onUpdate: (product: Product) => void, onClose: () => void }) => {
    type ProductFormData = Omit<Product, 'id' | 'b2bPrice' | 'b2cPrice' | 'stock'> & {
        b2bPrice: string | number;
        b2cPrice: string | number;
        stock: string | number;
    };
    
    const [formData, setFormData] = useState<ProductFormData>(
        product 
        ? { ...product, category: product.category || '', descriptionTamil: product.descriptionTamil || '', hsnCode: product.hsnCode || '' }
        : { description: '', descriptionTamil: '', barcode: '', b2bPrice: '', b2cPrice: '', stock: '', category: '', hsnCode: '' }
    );
    
    const descriptionRef = useRef<HTMLInputElement>(null);
    const descriptionTamilRef = useRef<HTMLInputElement>(null);
    const categoryRef = useRef<HTMLInputElement>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const b2bPriceRef = useRef<HTMLInputElement>(null);
    const b2cPriceRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const hsnCodeRef = useRef<HTMLInputElement>(null);
    const saveBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        descriptionRef.current?.focus();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const productData = { 
            description: formData.description,
            descriptionTamil: formData.descriptionTamil,
            category: formData.category,
            barcode: formData.barcode,
            hsnCode: formData.hsnCode,
            b2bPrice: parseFloat(String(formData.b2bPrice)) || 0,
            b2cPrice: parseFloat(String(formData.b2cPrice)) || 0,
            stock: parseFloat(String(formData.stock)) || 0,
        };

        if(product) {
            onUpdate({ ...productData, id: product.id });
        } else {
            onSave(productData);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, nextFieldRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextFieldRef.current?.focus();
        }
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2>{product ? 'Edit Product' : 'Add New Product'}</h2>
                <form onSubmit={handleSubmit} style={styles.productForm}>
                    <label style={styles.label}>Product Description</label>
                    <input 
                        ref={descriptionRef}
                        name="description" 
                        value={formData.description} 
                        onChange={handleChange} 
                        style={styles.input} 
                        required 
                        onKeyDown={(e) => handleKeyDown(e, descriptionTamilRef)}
                    />
                    
                    <label style={styles.label}>Product Description (Tamil) (Optional)</label>
                    <input
                        ref={descriptionTamilRef}
                        name="descriptionTamil"
                        value={formData.descriptionTamil}
                        onChange={handleChange}
                        style={styles.input}
                        onKeyDown={(e) => handleKeyDown(e, categoryRef)}
                    />

                    <label style={styles.label}>Category (Optional)</label>
                    <input
                        ref={categoryRef}
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        style={styles.input}
                        onKeyDown={(e) => handleKeyDown(e, hsnCodeRef)}
                    />
                    
                    <label style={styles.label}>HSN/SAC Code (Optional)</label>
                    <input
                        ref={hsnCodeRef}
                        name="hsnCode"
                        value={formData.hsnCode}
                        onChange={handleChange}
                        style={styles.input}
                        onKeyDown={(e) => handleKeyDown(e, b2bPriceRef)}
                    />


                    <div style={{display: 'flex', gap: '1rem', width: '100%'}}>
                        <div style={{flex: 1}}>
                           <label style={styles.label}>B2B Price</label>
                           <input 
                                ref={b2bPriceRef}
                                name="b2bPrice" 
                                type="number" 
                                step="0.01" 
                                value={formData.b2bPrice} 
                                onChange={handleChange} 
                                style={styles.input}
                                onKeyDown={(e) => handleKeyDown(e, b2cPriceRef)}
                                placeholder="0.00"
                            />
                        </div>
                        <div style={{flex: 1}}>
                           <label style={styles.label}>B2C Price</label>
                           <input 
                                ref={b2cPriceRef}
                                name="b2cPrice" 
                                type="number" 
                                step="0.01" 
                                value={formData.b2cPrice} 
                                onChange={handleChange} 
                                style={styles.input} 
                                onKeyDown={(e) => handleKeyDown(e, stockRef)}
                                placeholder="0.00"
                            />
                        </div>
                        <div style={{flex: 1}}>
                           <label style={styles.label}>Stock</label>
                           <input 
                                ref={stockRef}
                                name="stock" 
                                type="number" 
                                step="0.001" 
                                value={formData.stock} 
                                onChange={handleChange} 
                                style={styles.input} 
                                onKeyDown={(e) => handleKeyDown(e, barcodeRef)}
                                placeholder="0.000"
                            />
                        </div>
                    </div>
                    
                    <label style={styles.label}>Barcode / SKU</label>
                    <input 
                        ref={barcodeRef}
                        name="barcode" 
                        value={formData.barcode} 
                        onChange={handleChange} 
                        style={styles.input} 
                        onKeyDown={(e) => handleKeyDown(e, saveBtnRef)}
                    />
                    
                    <div style={styles.modalActions}>
                        <button type="button" onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                        <button ref={saveBtnRef} type="submit" style={styles.button}>Save Product</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- CUSTOMER FORM MODAL COMPONENT ---
const CustomerFormModal = ({ customer, onSave, onClose }: { customer: Customer | null, onSave: (customerData: Omit<Customer, 'id'>) => void, onClose: () => void }) => {
    const [formData, setFormData] = useState(
        customer ? { name: customer.name, mobile: customer.mobile } : { name: '', mobile: '' }
    );
    const nameRef = useRef<HTMLInputElement>(null);
    const mobileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name && formData.mobile) {
            onSave(formData);
        }
    };
    
     const handleKeyDown = (e: React.KeyboardEvent, nextFieldRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextFieldRef.current?.focus();
        }
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2>{customer ? 'Edit Customer' : 'Add New Customer'}</h2>
                <form onSubmit={handleSubmit} style={styles.productForm}>
                    <label style={styles.label}>Customer Name</label>
                    <input
                        ref={nameRef}
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        style={styles.input}
                        required
                        onKeyDown={(e) => handleKeyDown(e, mobileRef)}
                    />
                    <label style={styles.label}>Mobile Number</label>
                    <input
                        ref={mobileRef}
                        name="mobile"
                        type="tel"
                        value={formData.mobile}
                        onChange={handleChange}
                        style={styles.input}
                        required
                    />
                    <div style={styles.modalActions}>
                        <button type="button" onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)' }}>Cancel</button>
                        <button type="submit" style={styles.button}>Save Customer</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- CONFIRMATION MODAL COMPONENT ---
const ConfirmationModal = ({ message, onConfirm, onCancel }: { message: string, onConfirm: () => void, onCancel: () => void }) => {
    const cancelBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Focus the cancel button by default as it's the less destructive action
        cancelBtnRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            // Allow closing the modal with the Escape key
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        // Cleanup the event listener on component unmount
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onCancel]);

    return (
        <div style={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title">
            <div style={{...styles.modalContent, maxWidth: '450px'}}>
                <h3 id="confirmation-dialog-title" style={{marginTop: 0, color: 'var(--danger-color)'}}>Confirm Action</h3>
                <p>{message}</p>
                <div style={styles.modalActions}>
                    <button ref={cancelBtnRef} onClick={onCancel} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                    <button onClick={onConfirm} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>Confirm</button>
                </div>
            </div>
        </div>
    );
};

// --- BARCODE SCANNER MODAL ---
const BarcodeScannerModal = ({ onScan, onClose }: { onScan: (barcode: string) => void, onClose: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        let stream: MediaStream | null = null;
        
        // Check for BarcodeDetector API support
        if (!('BarcodeDetector' in window)) {
            setError('Barcode detection is not supported by your browser.');
            return;
        }

        const startScan = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'upc_a', 'code_128', 'qr_code'] });
                
                intervalRef.current = window.setInterval(async () => {
                    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
                    try {
                        const barcodes = await barcodeDetector.detect(videoRef.current);
                        if (barcodes.length > 0) {
                             // Stop the interval immediately to prevent multiple scans
                            if (intervalRef.current) {
                                clearInterval(intervalRef.current);
                                intervalRef.current = null;
                            }
                            onScan(barcodes[0].rawValue);
                        }
                    } catch (e) {
                        console.error('Barcode detection failed:', e);
                    }
                }, 200);

            } catch (err: any) {
                console.error('Error accessing camera:', err);
                if (err.name === 'NotAllowedError') {
                    setError('Camera permission was denied. Please allow camera access in your browser settings.');
                } else {
                    setError('Could not access the camera. Is it being used by another application?');
                }
            }
        };

        startScan();

        // Cleanup function
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onScan]);

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={{...styles.modalContent, maxWidth: '640px', padding: '1rem'}} onClick={(e) => e.stopPropagation()}>
                <h3 style={{marginTop: 0, textAlign: 'center'}}>Scan Product Barcode</h3>
                {error ? (
                    <p style={{color: 'var(--danger-color)', textAlign: 'center'}}>{error}</p>
                ) : (
                    <div style={{ position: 'relative', width: '100%', paddingTop: '75%' /* 4:3 Aspect Ratio */, background: '#000' }}>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '8px', objectFit: 'cover' }}
                        />
                         <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '10%',
                            right: '10%',
                            height: '2px',
                            transform: 'translateY(-50%)',
                            backgroundColor: 'rgba(255, 0, 0, 0.7)',
                            boxShadow: '0 0 10px rgba(255, 0, 0, 0.9)',
                         }}></div>
                    </div>
                )}
                <div style={styles.modalActions}>
                    <button onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                </div>
            </div>
        </div>
    );
};


// --- ICON COMPONENTS ---
const PdfIcon = ({ size = 80, color = 'var(--danger-color)' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color} style={{marginBottom: '1rem'}}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0 -1.1-.9-2-2-2zM9.5 11.5c0 .83-.67 1.5-1.5 1.5H7v2H5.5V9h2.5c.83 0 1.5.67 1.5 1.5v1zm3.5 1.5h-1v-2h-1.5v2h-1V9H13v4zm5.5-1.5h-1.5v-1h1.5v-1h-1.5v-1h1.5v-1h-3V9h3c.83 0 1.5.67 1.5 1.5v1.5c0 .83-.67 1.5-1.5 1.5z"/>
        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2-H4V6z"/>
    </svg>
);


// --- PDF UPLOAD MODAL ---
const PdfUploadModal = ({ onProcess, onClose }: { onProcess: (b2b: File, b2c: File) => void; onClose: () => void; }) => {
    const [b2bFile, setB2bFile] = useState<File | null>(null);
    const [b2cFile, setB2cFile] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'b2b' | 'b2c') => {
        const file = e.target.files?.[0] || null;
        if (type === 'b2b') setB2bFile(file);
        else setB2cFile(file);
        e.target.value = ''; // Allow re-selection of the same file
    };

    const handleProcessClick = () => {
        if (b2bFile && b2cFile) {
            onProcess(b2bFile, b2cFile);
        }
    };

    const fileInputStyle: React.CSSProperties = {
        border: '2px dashed var(--border-color)',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: '#f8f9fa',
        flex: 1,
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '800px' }}>
                <h2 style={{ marginTop: 0, textAlign: 'center' }}>Upload B2B & B2C Price Lists</h2>
                <p style={{ textAlign: 'center', color: 'var(--secondary-color)', marginBottom: '2rem' }}>
                    Select the PDF file for your B2B prices and the PDF for your B2C prices. The system will extract and merge them.
                </p>
                <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
                    <label style={fileInputStyle}>
                        <input type="file" accept="application/pdf" onChange={(e) => handleFileChange(e, 'b2b')} style={{ display: 'none' }} />
                        <PdfIcon size={40} />
                        <h4>B2B Price List</h4>
                        <span style={{ wordBreak: 'break-all' }}>{b2bFile ? b2bFile.name : 'Click to select file'}</span>
                    </label>
                    <label style={fileInputStyle}>
                        <input type="file" accept="application/pdf" onChange={(e) => handleFileChange(e, 'b2c')} style={{ display: 'none' }} />
                        <PdfIcon size={40} />
                        <h4>B2C Price List</h4>
                        <span style={{ wordBreak: 'break-all' }}>{b2cFile ? b2cFile.name : 'Click to select file'}</span>
                    </label>
                </div>
                <div style={styles.modalActions}>
                    <button onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)' }}>Cancel</button>
                    <button onClick={handleProcessClick} style={styles.button} disabled={!b2bFile || !b2cFile}>
                        Process PDFs
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- BULK ADD PRODUCTS MODAL ---
type EditableProduct = Omit<Product, 'id'>;

const BulkAddModal = ({ fileSrc, fileType, fileNames, initialProducts, onSave, onClose, loading, error }: {
    fileSrc: string | null;
    fileType: 'image' | 'pdf' | 'dual-pdf' | null;
    fileNames?: { b2b: string, b2c: string } | null;
    initialProducts: EditableProduct[];
    onSave: (products: EditableProduct[]) => void;
    onClose: () => void;
    loading: boolean;
    error: string | null;
}) => {
    const [products, setProducts] = useState<EditableProduct[]>(initialProducts);

    useEffect(() => {
        setProducts(initialProducts);
    }, [initialProducts]);

    const handleProductChange = (index: number, field: keyof EditableProduct, value: string | number) => {
        const updatedProducts = [...products];
        const product = { ...updatedProducts[index] };
        
        if (field === 'b2bPrice' || field === 'b2cPrice' || field === 'stock') {
             product[field] = parseFloat(value as string) || 0;
        } else {
             (product as any)[field] = value as string;
        }
        
        updatedProducts[index] = product;
        setProducts(updatedProducts);
    };
    
    const handleSave = () => {
        // Filter out products that don't have a description before saving
        const validProducts = products.filter(p => p.description.trim() !== '');
        onSave(validProducts);
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '1200px', display: 'flex', gap: '1.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                    {fileType === 'image' && fileSrc ? (
                        <>
                            <h3 style={{marginTop: 0}}>Uploaded Image</h3>
                            <img src={fileSrc} alt="Uploaded inventory" style={{ width: '100%', borderRadius: '8px', objectFit: 'contain', maxHeight: '70vh' }} />
                        </>
                    ) : fileType === 'pdf' ? (
                        <>
                            <h3 style={{marginTop: 0}}>Uploaded PDF</h3>
                            <PdfIcon />
                            <p>Analyzing PDF document to extract product list. Please review the extracted data on the right before saving.</p>
                        </>
                    ) : (
                         <>
                            <h3 style={{marginTop: 0}}>Uploaded Price Lists</h3>
                            <div style={{display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center'}}>
                                <div style={{textAlign: 'center'}}>
                                    <PdfIcon size={50} />
                                    <h4 style={{margin: '0 0 0.5rem 0'}}>B2B List</h4>
                                    <p style={{fontSize: '0.8rem', margin: 0, wordBreak: 'break-all'}}>{fileNames?.b2b}</p>
                                </div>
                                <div style={{textAlign: 'center'}}>
                                    <PdfIcon size={50} />
                                    <h4 style={{margin: '0 0 0.5rem 0'}}>B2C List</h4>
                                    <p style={{fontSize: '0.8rem', margin: 0, wordBreak: 'break-all'}}>{fileNames?.b2c}</p>
                                </div>
                            </div>
                            <p style={{marginTop: '1.5rem'}}>Analyzing documents to extract and merge product lists. Please review the data on the right before saving.</p>
                        </>
                    )}
                </div>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{marginTop: 0}}>Extracted Products</h3>
                    {loading && (
                        <div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
                            <style>{`
                                @keyframes bulk-add-spinner {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            `}</style>
                            <div style={{
                                border: '4px solid rgba(0, 0, 0, 0.1)',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                borderLeftColor: 'var(--primary-color)',
                                animation: 'bulk-add-spinner 1s ease infinite',
                                marginBottom: '1.5rem'
                            }}></div>
                            <p style={{margin: '0 0 0.5rem 0'}}>Analyzing with AI...</p>
                            <p style={{color: 'var(--secondary-color)', fontSize: '0.9rem'}}>This may take a moment. Please wait.</p>
                            <button onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)', marginTop: '1.5rem' }}>
                                Cancel
                            </button>
                        </div>
                    )}
                    {error && (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            padding: '1rem',
                        }}>
                            <h3 style={{ color: 'var(--danger-color)', margin: '0 0 1rem 0' }}>Error Processing File</h3>
                            <div style={{
                                backgroundColor: '#ffebee',
                                border: '1px solid var(--danger-color)',
                                borderRadius: '6px',
                                padding: '1rem',
                                marginBottom: '1rem',
                                wordBreak: 'break-word',
                                maxWidth: '100%',
                                textAlign: 'left',
                            }}>
                                <p style={{ margin: 0 }}>{error}</p>
                            </div>
                            <p style={{ color: 'var(--secondary-color)', fontSize: '0.9rem', maxWidth: '300px' }}>
                                It may have been moved, edited, or deleted. Please check the file and try again.
                            </p>
                            <button onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)', marginTop: '1rem' }}>
                                Back to Billing
                            </button>
                        </div>
                    )}
                    {!loading && !error && (
                        <>
                            <p style={{marginTop: 0, color: 'var(--secondary-color)'}}>Please review and edit the extracted product data below before saving.</p>
                            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                <table style={{ ...styles.table, tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{...styles.th, width: '25%'}}>Description</th>
                                            <th style={{...styles.th, width: '25%'}}>Description (Tamil)</th>
                                            <th style={{...styles.th, width: '10%'}}>Category</th>
                                            <th style={{...styles.th, width: '10%'}}>B2B Price</th>
                                            <th style={{...styles.th, width: '10%'}}>B2C Price</th>
                                            <th style={{...styles.th, width: '8%'}}>Stock</th>
                                            <th style={{...styles.th, width: '12%'}}>Barcode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map((p, index) => (
                                            <tr key={index}>
                                                <td style={styles.td}><input type="text" value={p.description} onChange={(e) => handleProductChange(index, 'description', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
                                                <td style={styles.td}><input type="text" value={p.descriptionTamil || ''} onChange={(e) => handleProductChange(index, 'descriptionTamil', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
                                                <td style={styles.td}><input type="text" value={p.category || ''} onChange={(e) => handleProductChange(index, 'category', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
                                                <td style={styles.td}><input type="number" step="0.01" value={p.b2bPrice} onChange={(e) => handleProductChange(index, 'b2bPrice', e.target.value)} style={{...styles.gridInput, width: '90%'}} /></td>
                                                <td style={styles.td}><input type="number" step="0.01" value={p.b2cPrice} onChange={(e) => handleProductChange(index, 'b2cPrice', e.target.value)} style={{...styles.gridInput, width: '90%'}} /></td>
                                                <td style={styles.td}><input type="number" step="1" value={p.stock} onChange={(e) => handleProductChange(index, 'stock', e.target.value)} style={{...styles.gridInput, width: '90%'}} /></td>
                                                <td style={styles.td}><input type="text" value={p.barcode} onChange={(e) => handleProductChange(index, 'barcode', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={styles.modalActions}>
                                <button onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)' }}>Cancel</button>
                                <button onClick={handleSave} style={{ ...styles.button, backgroundColor: 'var(--success-color)' }}>Save All Products</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- PRODUCTS VIEW COMPONENT ---
const ProductsView = ({ products, onEdit, onDelete, onAdd, onBulkAdd, onBulkAddPdfs, onExportPdf, selectedProductIds, setSelectedProductIds, onDeleteSelected, isOnline, aiUsage, onUpgrade, currentUser }) => {
    const [filter, setFilter] = useState<'all' | 'low'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const bulkAddInputRef = useRef<HTMLInputElement>(null);
    const AI_FREE_LIMIT = 3;

    const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'shop_admin';

    const lowStockThreshold = 10;
    const filteredProducts = products
        .filter(p => filter === 'all' || p.stock <= lowStockThreshold)
        .filter(p => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return (
                p.description.toLowerCase().includes(query) ||
                (p.descriptionTamil && p.descriptionTamil.toLowerCase().includes(query)) ||
                (p.barcode || '').toLowerCase().includes(query)
            );
        });
        
    const handleExport = () => {
        if (filteredProducts.length === 0) {
            alert("No products in the current view to export.");
            return;
        }

        const escapeCsvCell = (cellData: any) => {
            const stringData = String(cellData === null || cellData === undefined ? '' : cellData);
            if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
                return `"${stringData.replace(/"/g, '""')}"`;
            }
            return stringData;
        };

        const headers = ['ID', 'Description', 'Description (Tamil)', 'Category', 'HSN/SAC', 'Barcode', 'B2B Price', 'B2C Price', 'Stock'];
        const csvRows = [
            headers.join(','),
            ...filteredProducts.map(p => [
                p.id,
                escapeCsvCell(p.description),
                escapeCsvCell(p.descriptionTamil),
                escapeCsvCell(p.category),
                escapeCsvCell(p.hsnCode),
                escapeCsvCell(p.barcode),
                p.b2bPrice.toFixed(2),
                p.b2cPrice.toFixed(2),
                p.stock
            ].join(','))
        ];

        const csvContent = csvRows.join('\n');
        // Add BOM for Excel to recognize UTF-8 characters correctly (like Tamil script)
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const date = new Date().toISOString().slice(0, 10);
        link.setAttribute('download', `product_list_${date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleBulkAddClick = (isPdf: boolean) => {
        const canUseAi = onUpgrade();
        if (canUseAi) {
            if (isPdf) {
                onBulkAddPdfs();
            } else {
                bulkAddInputRef.current?.click();
            }
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onBulkAdd(e);
    };

    const handleSelectProduct = (id: number) => {
        setSelectedProductIds(prev =>
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedProductIds(filteredProducts.map(p => p.id));
        } else {
            setSelectedProductIds([]);
        }
    };

    const areAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.includes(p.id));
    
    const getEmptyMessage = () => {
        if (products.length === 0) {
            return 'No products found. Add a new product to get started.';
        }
        if (searchQuery) {
            return `No products found matching "${searchQuery}".`;
        }
        if (filter === 'low') {
            return 'No low stock products found.';
        }
        return 'No products to display.';
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Product Inventory</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                     <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <SearchIcon color="var(--secondary-color)" />
                        </span>
                        <input
                            type="search"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ ...styles.input, width: '300px', paddingLeft: '40px' }}
                            aria-label="Search products"
                        />
                    </div>
                    {isAdmin && selectedProductIds.length > 0 && (
                         <button onClick={onDeleteSelected} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>
                            Delete Selected ({selectedProductIds.length})
                        </button>
                    )}
                     <button onClick={() => setFilter(filter === 'all' ? 'low' : 'all')} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                        {filter === 'all' ? 'Show Low Stock' : 'Show All Products'}
                    </button>
                    {isAdmin && (
                        <>
                            <input
                                type="file"
                                accept="image/*"
                                ref={bulkAddInputRef}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                                disabled={!isOnline}
                            />
                             {!isOnline && <span style={{ color: 'var(--danger-color)', fontSize: '0.9rem' }}>AI features disabled offline</span>}
                            <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                <button onClick={() => handleBulkAddClick(false)} style={{...styles.button, backgroundColor: '#ffc107', color: 'black'}} disabled={!isOnline}>Bulk Add from Image</button>
                                {aiUsage.plan === 'free' && <span style={styles.proBadgeSmall}>Uses left: {Math.max(0, AI_FREE_LIMIT - aiUsage.count)}</span>}
                            </div>
                            <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                <button onClick={() => handleBulkAddClick(true)} style={{...styles.button, backgroundColor: 'var(--danger-color)'}} disabled={!isOnline}>Bulk Add from PDFs</button>
                                {aiUsage.plan === 'free' && <span style={styles.proBadgeSmall}>Uses left: {Math.max(0, AI_FREE_LIMIT - aiUsage.count)}</span>}
                            </div>
                            <button onClick={onAdd} style={styles.button}>Add New Product</button>
                            <button onClick={handleExport} style={{...styles.button, backgroundColor: 'var(--success-color)'}}>Export as Excel</button>
                            <button onClick={() => onExportPdf(filteredProducts)} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>Export as PDF</button>
                        </>
                    )}
                </div>
            </div>
            {filteredProducts.length > 0 ? (
                 <table style={styles.table}>
                    <thead>
                        <tr>
                            {isAdmin && (
                                <th style={{...styles.th, width: '40px', padding: '0.75rem'}}>
                                    <input
                                        type="checkbox"
                                        checked={areAllSelected}
                                        onChange={handleSelectAll}
                                        style={{width: '18px', height: '18px', verticalAlign: 'middle'}}
                                        aria-label="Select all products"
                                    />
                                </th>
                            )}
                            <th style={styles.th}>Description</th>
                            <th style={styles.th}>Description (Tamil)</th>
                            <th style={styles.th}>HSN/SAC</th>
                            <th style={styles.th}>Barcode</th>
                            <th style={styles.th}>B2B Price</th>
                            <th style={styles.th}>B2C Price</th>
                            <th style={styles.th}>Stock</th>
                            {isAdmin && <th style={styles.th}>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map(p => (
                            <tr key={p.id} style={p.stock <= lowStockThreshold ? { backgroundColor: '#fffbe6'} : {}}>
                                {isAdmin && (
                                    <td style={styles.td}>
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.includes(p.id)}
                                            onChange={() => handleSelectProduct(p.id)}
                                            style={{width: '18px', height: '18px', verticalAlign: 'middle'}}
                                            aria-label={`Select product ${p.description}`}
                                        />
                                    </td>
                                )}
                                <td style={styles.td}>{p.description}</td>
                                <td style={styles.td}>{p.descriptionTamil || 'N/A'}</td>
                                <td style={styles.td}>{p.hsnCode || 'N/A'}</td>
                                <td style={styles.td}>{p.barcode}</td>
                                <td style={styles.td}>₹{p.b2bPrice.toFixed(1)}</td>
                                <td style={styles.td}>₹{p.b2cPrice.toFixed(1)}</td>
                                <td style={{...styles.td, color: p.stock <= lowStockThreshold ? 'var(--danger-color)' : 'inherit', fontWeight: p.stock <= lowStockThreshold ? 'bold' : 'normal'}}>{p.stock}</td>
                                {isAdmin && (
                                    <td style={styles.td}>
                                        <button onClick={() => onEdit(p)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Edit</button>
                                        <button onClick={() => onDelete(p.id)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>Delete</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={styles.emptyMessage}>
                    {getEmptyMessage()}
                </p>
            )}
        </div>
    );
};

// --- BILL SETTINGS TYPES & DEFAULTS ---
interface BillSettings {
    size: '3-inch' | '4-inch' | 'A4' | 'A5' | 'custom';
    customWidth: string; // e.g., '80mm'
    format: 'simple' | 'detailed' | 'gst';
    logo: string | null; // base64
    shopName: string;
    shopAddress: string;
    gstin: string;
    tagline: string;
    footerNotes: string;
    shopNameEdited: boolean;
    displayOptions: {
        showLogo: boolean;
        showShopName: boolean;
        showShopAddress: boolean;
        showGstin: boolean;
        showTagline: boolean;
        showFooterNotes: boolean;
    };
    layout: 'default' | 'modern';
}

const defaultBillSettings: BillSettings = {
    size: '3-inch',
    customWidth: '76mm',
    format: 'detailed',
    logo: null,
    shopName: 'Your Shop Name',
    shopAddress: '123 Main Street, City, State, 12345',
    gstin: '',
    tagline: 'Thank you for your visit!',
    footerNotes: 'Goods once sold cannot be taken back.',
    shopNameEdited: false,
    displayOptions: {
        showLogo: true,
        showShopName: true,
        showShopAddress: true,
        showGstin: true,
        showTagline: true,
        showFooterNotes: true,
    },
    layout: 'default',
};

// --- NEW INVOICE PREVIEW MODAL ---
// FIX: Added explicit prop types to make 'onFinalize' optional, resolving a TypeScript error where the component was being invoked without it.
const InvoicePreviewModal = ({
    sale,
    onFinalize,
    onClose,
    isPreviewMode = false,
}: {
    sale: any;
    onFinalize?: () => void;
    onClose: () => void;
    isPreviewMode?: boolean;
}) => {
    const [whatsAppNumber, setWhatsAppNumber] = useState(sale.customerMobile || '');
    const [printSettings, setPrintSettings] = useState({
        paperSize: '4-inch',
        fontSize: 'medium',
        fontStyle: 'monospace',
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        offsets: { x: 0, y: 0 },
    });
    const printAreaRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<number[]>([]);
    const saleDate = new Date(sale.date);
    
    useEffect(() => {
        if (tableRef.current && columnWidths.length === 0) {
            // FIX: Specified the element type for querySelectorAll to ensure offsetWidth is available.
            const ths = Array.from(tableRef.current.querySelectorAll<HTMLTableCellElement>('thead th'));
            const initialWidths = ths.map(th => th.offsetWidth);
            if (initialWidths.length > 0 && initialWidths.every(w => w > 0)) {
                setColumnWidths(initialWidths);
            }
        }
    }, [sale, columnWidths.length]);

    const handleMouseDown = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        const startX = e.clientX;
        // FIX: Specified the element type for querySelectorAll to ensure offsetWidth is available.
        const startWidth = columnWidths[index] || (tableRef.current!.querySelectorAll<HTMLTableCellElement>('thead th')[index]).offsetWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = startWidth + deltaX;
            setColumnWidths(prevWidths => {
                const newWidths = [...prevWidths];
                newWidths[index] = Math.max(40, newWidth); // Minimum width
                return newWidths;
            });
        };

        const handleMouseUp = () => {
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleSettingChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const { name, value } = e.target;
        setPrintSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', value: string) => {
        setPrintSettings(prev => ({
            ...prev,
            margins: { ...prev.margins, [side]: parseInt(value) || 0 }
        }));
    };
    
    const handleOffsetChange = (axis: 'x' | 'y', value: string) => {
        setPrintSettings(prev => ({
            ...prev,
            offsets: { ...prev.offsets, [axis]: parseInt(value) || 0 }
        }));
    };
    
    const getPrintableStyles = (): React.CSSProperties => {
        const styles: React.CSSProperties = {
            backgroundColor: 'white',
            color: 'black',
            padding: `${printSettings.margins.top}px ${printSettings.margins.right}px ${printSettings.margins.bottom}px ${printSettings.margins.left}px`,
            transform: `translate(${printSettings.offsets.x}px, ${printSettings.offsets.y}px)`,
            fontFamily: printSettings.fontStyle,
            boxSizing: 'border-box',
        };

        switch (printSettings.paperSize) {
            case '3-inch': styles.width = '76mm'; break;
            case '4-inch': styles.width = '101mm'; break;
            case 'A4': styles.width = '210mm'; break;
            case 'A5': styles.width = '148mm'; break;
        }

        switch (printSettings.fontSize) {
            case 'small': styles.fontSize = '12px'; break;
            case 'medium': styles.fontSize = '14px'; break;
            case 'large': styles.fontSize = '16px'; break;
        }
        
        return styles;
    };

    const printInvoice = () => {
        if (!printAreaRef.current) return;
        
        const content = printAreaRef.current.innerHTML;
        const styles = getPrintableStyles();

        let columnStyles = '';
        if (columnWidths.length > 0) {
            const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
            if (totalWidth > 0) {
                columnStyles = columnWidths.map((width, i) => {
                    const percentage = (width / totalWidth) * 100;
                    return `table th:nth-child(${i + 1}), table td:nth-child(${i + 1}) { width: ${percentage}%; }`;
                }).join('\n');
            }
        }
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`
                <html>
                    <head><title>Print Invoice</title>
                        <style>
                            body { 
                                font-family: ${styles.fontFamily};
                                font-size: ${styles.fontSize};
                                width: ${styles.width};
                                margin: 0;
                            }
                            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                            th, td { text-align: left; padding: 4px 2px; word-wrap: break-word; }
                            hr { border: none; border-top: 1px dashed black; }
                            .text-right { text-align: right; }
                            ${columnStyles}
                        </style>
                    </head>
                    <body>${content}</body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                document.body.removeChild(iframe);
            }, 500);
        }
    };
    
    const saveAsPdf = () => {
        const element = printAreaRef.current;
        if (!element) return;
        
        html2pdf(element, {
            margin: 0,
            filename: `invoice-${sale.id || Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: printSettings.paperSize === 'A4' ? 'a4' : 'letter', orientation: 'portrait' }
        });
    };
    
    const headers = [
        { label: 'S.No', align: 'left' as const },
        { label: 'Item', align: 'left' as const },
        { label: 'Qty', align: 'right' as const },
        { label: 'Price', align: 'right' as const },
        { label: 'Total', align: 'right' as const },
    ];
    
    return (
        <div style={styles.modalBackdrop}>
            <div style={{
                backgroundColor: 'var(--background-color)',
                width: '95vw',
                height: '95vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                    <div ref={printAreaRef} style={{...getPrintableStyles(), boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minHeight: '100px'}}>
                        <div style={{ textAlign: 'center', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0 }}>Invoice</h2>
                            <p style={{ margin: '5px 0' }}>Date: {saleDate.toLocaleString()}</p>
                        </div>
                        <hr style={{ border: 'none', borderTop: '1px dashed black' }} />
                        <table ref={tableRef} style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0', tableLayout: 'fixed' }}>
                            <colgroup>
                               {columnWidths.map((width, i) => <col key={i} style={{ width: width ? `${width}px` : undefined }} />)}
                            </colgroup>
                            <thead>
                                <tr>
                                    {headers.map((header, i) => (
                                        <th key={header.label} style={{ padding: '5px 2px', textAlign: header.align, position: 'relative' }}>
                                            {header.label}
                                            {i < headers.length - 1 && (
                                                <div
                                                    onMouseDown={e => handleMouseDown(e, i)}
                                                    style={{
                                                        position: 'absolute', top: 0, right: -3, bottom: 0, width: '6px',
                                                        cursor: 'col-resize', zIndex: 2
                                                    }}
                                                />
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sale.items.map((item: SaleItem, index: number) => (
                                    <tr key={item.id}>
                                        <td style={{textAlign: headers[0].align, padding: '4px 2px'}}>{index + 1}</td>
                                        <td style={{textAlign: headers[1].align, padding: '4px 2px'}}>{item.description}</td>
                                        <td style={{textAlign: headers[2].align, padding: '4px 2px'}}>{item.quantity}</td>
                                        <td style={{textAlign: headers[3].align, padding: '4px 2px'}}>{item.price.toFixed(2)}</td>
                                        <td style={{textAlign: headers[4].align, padding: '4px 2px'}}>{(item.quantity * item.price).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <hr style={{ border: 'none', borderTop: '1px dashed black' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <div style={{ minWidth: '150px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Grand Total</span>
                                    <strong>₹{sale.total.toFixed(2)}</strong>
                                </div>
                            </div>
                        </div>
                         <p style={{ textAlign: 'center', marginTop: '20px' }}>Thank you for your business!</p>
                    </div>
                </div>

                <div style={{ flexShrink: 0, backgroundColor: 'var(--surface-color)', padding: '1rem', borderTop: '1px solid var(--border-color)', boxShadow: '0 -2px 8px rgba(0,0,0,0.05)' }}>
                    {/* Actions Row */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                        <button onClick={printInvoice} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Print</button>
                        <button onClick={saveAsPdf} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>Save as PDF</button>
                        <input type="tel" value={whatsAppNumber} onChange={e => setWhatsAppNumber(e.target.value)} placeholder="WhatsApp Number" style={{ ...styles.input, flex: 1 }} />
                        <button style={{...styles.button, backgroundColor: '#25D366'}}>Send</button>
                        <button onClick={() => setColumnWidths([])} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}} title="Reset column widths to default">Reset Layout</button>
                    </div>
                    {/* Settings Row */}
                     <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Paper Size</label>
                            <select name="paperSize" value={printSettings.paperSize} onChange={handleSettingChange} style={{...styles.input, width: 'auto'}}>
                                <option value="4-inch">4 Inch</option>
                                <option value="3-inch">3 Inch</option>
                                <option value="A4">A4</option>
                                <option value="A5">A5</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Font Size</label>
                            <select name="fontSize" value={printSettings.fontSize} onChange={handleSettingChange} style={{...styles.input, width: 'auto'}}>
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Font Style</label>
                            <select name="fontStyle" value={printSettings.fontStyle} onChange={handleSettingChange} style={{...styles.input, width: 'auto'}}>
                                <option value="monospace">Monospace</option>
                                <option value="sans-serif">Sans-serif</option>
                                <option value="serif">Serif</option>
                            </select>
                        </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Margins (px)</label>
                            <input type="number" value={printSettings.margins.top} onChange={e => handleMarginChange('top', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Top" />
                            <input type="number" value={printSettings.margins.right} onChange={e => handleMarginChange('right', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Right" />
                             <input type="number" value={printSettings.margins.bottom} onChange={e => handleMarginChange('bottom', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Bottom" />
                             <input type="number" value={printSettings.margins.left} onChange={e => handleMarginChange('left', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Left" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Offsets (px)</label>
                            <input type="number" value={printSettings.offsets.x} onChange={e => handleOffsetChange('x', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Horizontal" />
                            <input type="number" value={printSettings.offsets.y} onChange={e => handleOffsetChange('y', e.target.value)} style={{ ...styles.input, width: '60px' }} title="Vertical" />
                        </div>
                    </div>
                    {/* Final Actions Row */}
                     <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                        {onFinalize ? (
                            <>
                                <button onClick={onFinalize} style={{...styles.button, backgroundColor: 'var(--success-color)', flex: 1}}>Complete Sale</button>
                                <button onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Back to Edit Sale</button>
                            </>
                        ) : (
                            <button onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)', width: '100%'}}>
                                {isPreviewMode ? 'Close Preview' : 'New Sale'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- CUSTOMER HISTORY MODAL ---
const HistoryModal = ({ salesHistory, customerMobile, onClose }) => {
    const customerSales = salesHistory.filter(sale => sale.customerMobile === customerMobile);
    
    return (
        <div style={styles.modalBackdrop}>
            <div style={{...styles.modalContent, maxWidth: '800px'}}>
                <h2>Purchase History for {customerMobile}</h2>
                {customerSales.length > 0 ? (
                    <div style={{maxHeight: '60vh', overflowY: 'auto'}}>
                        {customerSales.map(sale => (
                            <div key={sale.id} style={{border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem'}}>
                                <h4>Date: {new Date(sale.date).toLocaleString()} (Total: ₹{sale.total.toFixed(1)})</h4>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Item</th>
                                            <th style={styles.th}>Qty</th>
                                            <th style={styles.th}>Price</th>
                                            <th style={styles.th}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sale.items.map((item: SaleItem) => (
                                            <tr key={item.id}>
                                                <td style={styles.td}>{item.description} {item.isReturn && '(Return)'}</td>
                                                <td style={styles.td}>{item.quantity}</td>
                                                <td style={styles.td}>₹{item.price.toFixed(1)}</td>
                                                <td style={styles.td}>₹{(item.price * item.quantity).toFixed(1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p>No purchase history found for this customer.</p>
                )}
                 <div style={styles.modalActions}>
                    <button onClick={onClose} style={styles.button}>Close</button>
                </div>
            </div>
        </div>
    );
};


// --- REPORTS VIEW COMPONENT ---
const ReportsView = ({ salesHistory, onPrint, userPlan, onUpgrade, isOnline }) => {
    const [filterType, setFilterType] = useState('today');
    const todayISO = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(todayISO);
    const [endDate, setEndDate] = useState(todayISO);
    const [expandedSale, setExpandedSale] = useState<string | null>(null);
    const [reportTab, setReportTab] = useState('sales');
    const [forecast, setForecast] = useState<string | null>(null);
    const [isForecastLoading, setIsForecastLoading] = useState(false);
    const [forecastError, setForecastError] = useState<string | null>(null);

    const getFilterRange = () => {
        const now = new Date();
        let start: Date, end: Date;

        switch (filterType) {
            case 'today':
                start = new Date();
                start.setHours(0, 0, 0, 0);
                end = new Date();
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start = new Date();
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                start = new Date();
                start.setDate(now.getDate() - now.getDay()); // Sunday as start of week
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                const [sy, sm, sd] = startDate.split('-').map(Number);
                start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
                const [ey, em, ed] = endDate.split('-').map(Number);
                end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
                if (start > end) [start, end] = [end, start]; // Swap if needed
                break;
            default:
                start = new Date();
                end = new Date();
                break;
        }
        return { start, end };
    };

    const { start, end } = getFilterRange();
    
    const filteredSales = salesHistory.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate >= start && saleDate <= end;
    });

    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.paid_amount, 0);
    const totalOutstanding = filteredSales.reduce((sum, sale) => sum + sale.balance_due, 0);
    const totalItemsSold = filteredSales.reduce((sum, sale) => sum + sale.items.filter(i => !i.isReturn).length, 0);
    const totalTransactions = filteredSales.length;

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newFilter = e.target.value;
        const isProFilter = ['this_week', 'this_month', 'custom'].includes(newFilter);
        if (userPlan === 'free' && isProFilter) {
            onUpgrade();
        } else {
            setFilterType(newFilter);
        }
    };
    
    const handleGenerateForecast = async () => {
        if (!onUpgrade()) return; // This will trigger the modal if user is free
        if (!isOnline) {
            setForecastError("AI features require an internet connection.");
            return;
        }

        setIsForecastLoading(true);
        setForecast(null);
        setForecastError(null);
        
        try {
            const recentSales = salesHistory
                .filter(sale => new Date(sale.date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
                .map(s => ({ date: s.date, total: s.total, items: s.items.map(i => i.description) }));
                
            if (recentSales.length < 5) {
                throw new Error("Not enough sales data from the last 30 days to generate a reliable forecast. At least 5 sales are required.");
            }

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                Based on the following JSON sales data from the last 30 days, please provide a sales forecast and analysis.
                
                Data:
                ${JSON.stringify(recentSales)}
                
                Your response should be formatted as follows:
                1.  **Sales Forecast (Next 7 Days):** A brief, day-by-day prediction of total sales revenue.
                2.  **Top 3 Products to Restock:** Based on sales frequency, identify the three most important products to re-order.
                3.  **Key Trend Analysis:** A short paragraph (2-3 sentences) identifying any noticeable trends, like peak sales days or popular product categories.
                
                Keep your analysis concise and easy to read for a busy shop owner.
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });

            setForecast(response.text);

        } catch (error: any) {
            console.error("Error generating forecast:", error);
            setForecastError(error.message || "An unknown error occurred.");
        } finally {
            setIsForecastLoading(false);
        }
    };


    const getReportTitle = () => {
        switch (filterType) {
            case 'today': return `Today's Sales Report`;
            case 'yesterday': return `Yesterday's Sales Report`;
            case 'this_week': return `This Week's Sales Report`;
            case 'this_month': return `This Month's Sales Report`;
            case 'custom':
                 if (startDate === endDate) return `Sales Report for ${new Date(start).toLocaleDateString()}`;
                return `Sales Report from ${new Date(start).toLocaleDateString()} to ${new Date(end).toLocaleDateString()}`;
            default: return 'Sales Report';
        }
    };
    
    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>{getReportTitle()}</h2>
                <div style={styles.reportFilters}>
                    <select value={filterType} onChange={handleFilterChange} style={{...styles.input, height: 'auto'}}>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="this_week" disabled={userPlan === 'free'}>This Week {userPlan === 'free' && '(PRO)'}</option>
                        <option value="this_month" disabled={userPlan === 'free'}>This Month {userPlan === 'free' && '(PRO)'}</option>
                        <option value="custom" disabled={userPlan === 'free'}>Custom Range {userPlan === 'free' && '(PRO)'}</option>
                    </select>
                    {filterType === 'custom' && userPlan === 'pro' && (
                        <div style={styles.dateRangePicker}>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={styles.input} />
                            <span style={{color: 'var(--secondary-color)'}}>to</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={styles.input} />
                        </div>
                    )}
                </div>
            </div>
             <div style={styles.reportTabs}>
                <button onClick={() => setReportTab('sales')} style={reportTab === 'sales' ? {...styles.reportTabButton, ...styles.reportTabButtonActive} : styles.reportTabButton}>Sales Summary</button>
                <div style={{position: 'relative'}}>
                     <button onClick={() => setReportTab('forecast')} style={reportTab === 'forecast' ? {...styles.reportTabButton, ...styles.reportTabButtonActive} : styles.reportTabButton}>AI Forecast</button>
                     {userPlan === 'free' && <span style={styles.proBadge}>PRO</span>}
                </div>
            </div>
            {reportTab === 'sales' && (
                <>
                    <div style={styles.reportSummary}>
                         <div style={styles.summaryCard}><h3>Total Revenue</h3><p>₹{totalRevenue.toFixed(1)}</p></div>
                         <div style={{...styles.summaryCard, border: '1px solid var(--danger-color)'}}><h3>Outstanding</h3><p style={{color: 'var(--danger-color)'}}>₹{totalOutstanding.toFixed(1)}</p></div>
                         <div style={styles.summaryCard}><h3>Items Sold</h3><p>{totalItemsSold}</p></div>
                         <div style={styles.summaryCard}><h3>Transactions</h3><p>{totalTransactions}</p></div>
                    </div>
                    <h3>Transactions</h3>
                    {filteredSales.length > 0 ? (
                        <div style={{maxHeight: '50vh', overflowY: 'auto'}}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Time</th>
                                    <th style={styles.th}>Customer</th>
                                    <th style={styles.th}>Items</th>
                                    <th style={styles.th}>Total</th>
                                    <th style={styles.th}>Balance Due</th>
                                    <th style={styles.th}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSales.map(sale => (
                                    <React.Fragment key={sale.id}>
                                        <tr style={sale.balance_due > 0 ? {backgroundColor: '#fffbe6'} : {}}>
                                            <td style={styles.td}>{new Date(sale.date).toLocaleString()}</td>
                                            <td style={styles.td}>{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td>
                                            <td style={styles.td}>{sale.items.length}</td>
                                            <td style={styles.td}>₹{sale.total.toFixed(1)}</td>
                                            <td style={{...styles.td, color: sale.balance_due > 0 ? 'var(--danger-color)' : 'inherit', fontWeight: 'bold'}}>₹{sale.balance_due.toFixed(1)}</td>
                                            <td style={styles.td}>
                                                <button onClick={() => setExpandedSale(expandedSale === sale.id ? null : sale.id)} style={{...styles.actionButton, backgroundColor: 'var(--secondary-color)', marginRight: '0.5rem'}}>
                                                    {expandedSale === sale.id ? 'Hide' : 'View'}
                                                </button>
                                                <button onClick={() => onPrint(sale)} style={{...styles.actionButton, backgroundColor: 'var(--primary-color)'}}>
                                                    Re-Print
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedSale === sale.id && (
                                            <tr>
                                                <td colSpan={6} style={{padding: '0.5rem', backgroundColor: '#f9f9f9'}}>
                                                    <table style={styles.table}>
                                                         <thead>
                                                            <tr>
                                                                <th style={styles.th}>Description</th>
                                                                <th style={styles.th}>Qty</th>
                                                                <th style={styles.th}>Price</th>
                                                                <th style={styles.th}>Return</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sale.items.map((item: SaleItem) => (
                                                                <tr key={item.id}>
                                                                    <td style={styles.td}>{item.description}</td>
                                                                    <td style={styles.td}>{item.quantity}</td>
                                                                    <td style={styles.td}>₹{item.price.toFixed(1)}</td>
                                                                    <td style={styles.td}>{item.isReturn ? 'Yes' : 'No'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    ) : (
                        <p style={styles.emptyMessage}>No sales recorded for this period.</p>
                    )}
                </>
            )}
            {reportTab === 'forecast' && (
                <div style={{padding: '1rem'}}>
                    {userPlan === 'free' ? (
                        <div style={{textAlign: 'center', padding: '2rem', border: '2px dashed var(--border-color)', borderRadius: '8px'}}>
                            <h3>Unlock AI-Powered Sales Forecasting</h3>
                            <p style={{color: 'var(--secondary-color)'}}>Upgrade to the Pro plan to predict future sales, get smart restocking suggestions, and identify key trends in your business.</p>
                            <button onClick={onUpgrade} style={styles.button}>Upgrade to Pro</button>
                        </div>
                    ) : (
                        <div>
                             <button onClick={handleGenerateForecast} disabled={isForecastLoading || !isOnline} style={styles.button}>
                                {isForecastLoading ? 'Generating Forecast...' : 'Generate New Forecast'}
                            </button>
                            {!isOnline && <p style={{color: 'var(--danger-color)', marginTop: '1rem'}}>AI Forecast is unavailable offline. Please connect to the internet.</p>}
                            {isForecastLoading && <p style={{marginTop: '1rem'}}>Analyzing your sales data... please wait.</p>}
                            {forecastError && <p style={{color: 'var(--danger-color)', marginTop: '1rem'}}>{forecastError}</p>}
                            {forecast && (
                                <div style={{
                                    marginTop: '1.5rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '1.5rem',
                                    backgroundColor: '#f8f9fa',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.6'
                                }}>
                                    {forecast}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


// --- CUSTOMERS VIEW COMPONENT ---
const CustomersView = ({ customers, salesHistory, onAdd, onEdit, onDelete, currentUser }) => {
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'shop_admin';

    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobile.includes(searchQuery)
    );
    
    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    
    const { customerSales, totalBalanceDue } = React.useMemo(() => {
        if (!selectedCustomer) return { customerSales: [], totalBalanceDue: 0 };

        const sales = salesHistory
            .filter(s => s.customerMobile === selectedCustomer.mobile)
            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        const balance = sales.reduce((acc, sale) => acc + (sale.balance_due || 0), 0);

        return { customerSales: sales, totalBalanceDue: balance };
    }, [selectedCustomer, salesHistory]);

        
    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomerId(customer.id);
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Customer Management</h2>
                {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={onAdd} style={styles.button}>Add New Customer</button>
                    </div>
                )}
            </div>
            <div style={styles.customerViewLayout}>
                <div style={styles.customerListPanel}>
                    <div style={{ position: 'relative', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                         <span style={{ position: 'absolute', left: '1.75rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <SearchIcon color="var(--secondary-color)" />
                        </span>
                        <input
                            type="search"
                            placeholder="Search customers..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ ...styles.input, width: '100%', boxSizing: 'border-box', paddingLeft: '40px' }}
                            aria-label="Search customers"
                        />
                    </div>
                    <div style={{maxHeight: '65vh', overflowY: 'auto'}}>
                        {filteredCustomers.map(customer => (
                            <div 
                                key={customer.id} 
                                style={selectedCustomerId === customer.id ? {...styles.customerListItem, ...styles.customerListItemActive} : styles.customerListItem}
                                onClick={() => handleSelectCustomer(customer)}
                            >
                                <strong style={{display: 'block'}}>{customer.name}</strong>
                                <span style={{fontSize: '0.9rem', color: 'var(--secondary-color)'}}>{customer.mobile}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={styles.customerDetailPanel}>
                    {selectedCustomer ? (
                        <>
                            <div style={styles.customerDetailHeader}>
                                <div>
                                    <h3>{selectedCustomer.name}</h3>
                                    <p style={{margin: 0, color: 'var(--secondary-color)'}}>{selectedCustomer.mobile}</p>
                                    {totalBalanceDue > 0 && 
                                        <p style={{margin: '0.5rem 0 0', color: 'var(--danger-color)', fontWeight: 'bold', fontSize: '1.1rem'}}>
                                            Total Outstanding: ₹{totalBalanceDue.toFixed(2)}
                                        </p>
                                    }
                                </div>
                                {isAdmin && (
                                    <div style={{display: 'flex', gap: '0.5rem'}}>
                                        <button onClick={() => onEdit(selectedCustomer)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Edit</button>
                                        <button onClick={() => onDelete(selectedCustomer)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>Delete</button>
                                    </div>
                                )}
                            </div>
                            <h4>Purchase History</h4>
                            <div style={{maxHeight: '55vh', overflowY: 'auto'}}>
                                {customerSales.length > 0 ? (
                                    customerSales.map(sale => (
                                        <div key={sale.id} style={styles.purchaseHistoryItem}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                                <strong>{new Date(sale.date).toLocaleString()}</strong>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                                     {sale.balance_due > 0 && <span style={styles.dueTag}>DUE</span>}
                                                    <strong>Total: ₹{sale.total.toFixed(1)}</strong>
                                                </div>
                                            </div>
                                            <ul style={{margin: 0, paddingLeft: '1.5rem'}}>
                                                {sale.items.map(item => (
                                                    <li key={item.id} style={{color: item.isReturn ? 'var(--danger-color)' : 'inherit'}}>
                                                        {item.description} (Qty: {item.quantity}, Price: ₹{item.price.toFixed(1)}) {item.isReturn ? '(Return)' : ''}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))
                                ) : <p style={styles.emptyMessage}>No purchase history found.</p>}
                            </div>
                        </>
                    ) : (
                        <div style={{textAlign: 'center', padding: '4rem 1rem'}}>
                            <p style={{color: 'var(--secondary-color)'}}>Select a customer from the list to view their details and purchase history.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- EXPENSES VIEW COMPONENT ---
const ExpensesView = ({ expenses, onAdd, onDelete, shopId, userPlan, onUpgrade }: { expenses: Expense[], onAdd: (expense: Omit<Expense, 'id'>) => void, onDelete: (id: number) => void, shopId: number, userPlan: UserPlan, onUpgrade: () => boolean }) => {
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    
    const [filterType, setFilterType] = useState('this_month');
    const todayISO = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(todayISO);
    const [endDate, setEndDate] = useState(todayISO);
    
    const descriptionRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        descriptionRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const amountNum = parseFloat(amount);
        if (description.trim() && !isNaN(amountNum) && amountNum > 0) {
            onAdd({
                shop_id: shopId,
                date,
                description: description.trim(),
                category: category.trim(),
                amount: amountNum,
            });
            setDescription('');
            setCategory('');
            setAmount('');
            descriptionRef.current?.focus();
        } else {
            alert("Please enter a valid description and amount.");
        }
    };
    
    const getFilterRange = () => {
        const now = new Date();
        let start: Date, end: Date;
        switch (filterType) {
            case 'today':
                start = new Date(); start.setHours(0, 0, 0, 0);
                end = new Date(); end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start = new Date(); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
                end = new Date(start); end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                start = new Date(); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
                end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                const [sy, sm, sd] = startDate.split('-').map(Number);
                start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
                const [ey, em, ed] = endDate.split('-').map(Number);
                end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
                if (start > end) [start, end] = [end, start];
                break;
            default: start = new Date(); end = new Date(); break;
        }
        return { start, end };
    };

    const { start, end } = getFilterRange();
    const filteredExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        const startOfDay = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
        return startOfDay >= start && startOfDay <= end;
    });
    
    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newFilter = e.target.value;
        const isProFilter = ['custom'].includes(newFilter);
        if (userPlan === 'free' && isProFilter) {
            onUpgrade();
        } else {
            setFilterType(newFilter);
        }
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Expense Management</h2>
            </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start'}}>
                <div style={{...styles.settingsCard, margin: 0}}>
                    <h3 style={{marginTop: 0}}>Add New Expense</h3>
                    <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                        <div>
                            <label style={styles.label}>Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} required />
                        </div>
                        <div>
                            <label style={styles.label}>Description</label>
                            <input ref={descriptionRef} type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., Office Supplies" style={styles.input} required />
                        </div>
                        <div>
                            <label style={styles.label}>Category (Optional)</label>
                            <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g., Utilities" style={styles.input} />
                        </div>
                        <div>
                            <label style={styles.label}>Amount (₹)</label>
                            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={styles.input} required />
                        </div>
                        <button type="submit" style={styles.button}>Add Expense</button>
                    </form>
                </div>
                
                <div>
                    <div style={{...styles.viewHeader, marginBottom: '1rem'}}>
                        <h3>Expense History</h3>
                         <div style={styles.reportFilters}>
                            <select value={filterType} onChange={handleFilterChange} style={{...styles.input, height: 'auto'}}>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="this_week">This Week</option>
                                <option value="this_month">This Month</option>
                                <option value="custom" disabled={userPlan === 'free'}>Custom Range {userPlan === 'free' && '(PRO)'}</option>
                            </select>
                            {filterType === 'custom' && userPlan !== 'free' && (
                                <div style={styles.dateRangePicker}>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={styles.input} />
                                    <span style={{color: 'var(--secondary-color)'}}>to</span>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={styles.input} />
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{...styles.summaryCard, textAlign: 'right', marginBottom: '1rem', padding: '1rem'}}>
                        <h4 style={{margin: 0}}>Total for Period: <span style={{color: 'var(--danger-color)'}}>₹{totalExpenses.toFixed(2)}</span></h4>
                    </div>
                    {filteredExpenses.length > 0 ? (
                        <div style={{maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px'}}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Date</th>
                                        <th style={styles.th}>Description</th>
                                        <th style={styles.th}>Category</th>
                                        <th style={styles.th}>Amount</th>
                                        <th style={styles.th}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredExpenses.map(exp => (
                                        <tr key={exp.id}>
                                            <td style={styles.td}>{new Date(exp.date).toLocaleDateString()}</td>
                                            <td style={styles.td}>{exp.description}</td>
                                            <td style={styles.td}>{exp.category || 'N/A'}</td>
                                            <td style={styles.td}>₹{exp.amount.toFixed(2)}</td>
                                            <td style={styles.td}>
                                                <button onClick={() => onDelete(exp.id)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={styles.emptyMessage}>No expenses recorded for this period.</p>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- ICON COMPONENTS ---
const SearchIcon = ({ color = 'currentColor', size = 20 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </svg>
);

const MicIcon = ({ color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
    </svg>
);

const ScanIcon = ({ color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2-H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2zM7 11h10v2H7v-2z"/>
    </svg>
);

const UserIcon = ({ size = 24, color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
);

const PlusIcon = ({ size = 24, color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
    </svg>
);

const MinusIcon = ({ size = 24, color = 'currentColor' }) => (
     <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M19 13H5v-2h14v2z"/>
    </svg>
);

const TrashIcon = ({ size = 24, color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/>
    </svg>
);

const CloudIcon = ({ size = 24, color = 'currentColor' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" height={`${size}px`} viewBox="0 0 24 24" width={`${size}px`} fill={color}>
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
    </svg>
);


// --- SALES VIEW COMPONENT ---
const SalesView = ({ 
    products, 
    activeCart,
    updateActiveCart,
    onPreview, 
    total,
    paidAmount,
    setPaidAmount,
    onAmountPaidEdit,
    previousBalanceDue,
    onShowHistory,
    onSaveBackup,
    onRestoreBackup,
    onUpdateProductPrice,
    onUpdateProductDetails,
    onAddNewProduct,
    isOnline,
    viewMode,
    setViewMode,
    currentUser,
    activeCartIndex,
    onCartChange,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [priceMode, setPriceMode] = useState<'b2b' | 'b2c'>('b2c');
    const [isListening, setIsListening] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    
    // Local state for mobile input to prevent re-render loop
    const [localCountryCode, setLocalCountryCode] = useState('+91');
    const [localMobileNumber, setLocalMobileNumber] = useState('');

    const customerNameRef = useRef<HTMLInputElement>(null);
    const customerMobileRef = useRef<HTMLInputElement>(null);
    const productSearchRef = useRef<HTMLInputElement>(null);
    const quantityInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const priceInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const recognitionRef = useRef<any>(null);
    const searchResultsContainerRef = useRef<HTMLUListElement>(null);
    
    const finalBalance = total - paidAmount;

    useEffect(() => {
        if (highlightedIndex > -1 && searchResultsContainerRef.current) {
            const highlightedItem = searchResultsContainerRef.current.children[highlightedIndex] as HTMLLIElement;
            if (highlightedItem) {
                highlightedItem.scrollIntoView({
                    block: 'nearest',
                });
            }
        }
    }, [highlightedIndex]);

    const canChangePrice = currentUser?.role !== 'cashier';
    const canEditProductDetails = currentUser?.role !== 'cashier';

    useEffect(() => {
        customerNameRef.current?.focus();
    }, []);

     // Sync local mobile state with parent prop only when the active cart changes
    useEffect(() => {
        const fullMobile = activeCart.customerMobile || '';
        let countryCode = '+91';
        let mobileNumber = fullMobile;

        if (fullMobile.startsWith('+')) {
            // Simple logic for 3-char country codes like +91
            const potentialCode = fullMobile.substring(0, 3);
            if (!isNaN(Number(potentialCode.substring(1)))) {
                 countryCode = potentialCode;
                 mobileNumber = fullMobile.substring(3);
            }
        }
        
        setLocalCountryCode(countryCode);
        setLocalMobileNumber(mobileNumber);
    }, [activeCart.customerMobile]);


    const handleCountryCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCode = e.target.value;
        setLocalCountryCode(newCode);
        updateActiveCart({ customerMobile: newCode + localMobileNumber });
    };

    const handleMobileNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newNumber = e.target.value;
        setLocalMobileNumber(newNumber);
        updateActiveCart({ customerMobile: localCountryCode + newNumber });
    };

    const handleCustomerKeyDown = (e: React.KeyboardEvent, nextField: 'mobile' | 'product') => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextField === 'mobile') {
                customerMobileRef.current?.focus();
            } else {
                productSearchRef.current?.focus();
            }
        }
    };

    const filterProducts = useCallback((term: string) => {
        if (!term) return [];
        const lowerTerm = term.toLowerCase();
        return products.filter(p => 
            p.description.toLowerCase().includes(lowerTerm) || 
            (p.descriptionTamil && p.descriptionTamil.toLowerCase().includes(lowerTerm)) ||
            (p.barcode || '').toLowerCase().includes(lowerTerm)
        );
    }, [products]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearchTerm(term);
        setSearchResults(filterProducts(term));
        setHighlightedIndex(-1);
    };
    
    const handleAddToSale = (product: Product, focusOnQuantity: boolean = true) => {
        const price = priceMode === 'b2b' ? product.b2bPrice : product.b2cPrice;

        const existingItemIndex = activeCart.items.findIndex(item => item.productId === product.id && !item.isReturn);
        
        let focusIndex = -1;

        if (existingItemIndex > -1) {
            const updatedItems = [...activeCart.items];
            updatedItems[existingItemIndex].quantity += 1;
            updateActiveCart({ items: updatedItems });
            focusIndex = existingItemIndex;
        } else {
            const newItem: SaleItem = {
                id: Date.now(),
                productId: product.id,
                description: product.description,
                descriptionTamil: product.descriptionTamil,
                quantity: 1,
                price: price,
                isReturn: false,
                hsnCode: product.hsnCode,
            };
            updateActiveCart({ items: [...activeCart.items, newItem] });
            // The index for the new item will be the current length of the items array
            // before the state update is committed.
            focusIndex = activeCart.items.length; 
        }

        setSearchTerm('');
        setSearchResults([]);
        setHighlightedIndex(-1);
        
        if (viewMode === 'desktop' && focusOnQuantity && focusIndex > -1) {
            setTimeout(() => {
                const inputRef = quantityInputRefs.current[focusIndex];
                if (inputRef) {
                    inputRef.focus();
                    inputRef.select();
                }
            }, 100);
        }
    };

    const handleCreateAndAddProduct = () => {
        const newProduct = onAddNewProduct(searchTerm);
        if (newProduct) {
            handleAddToSale(newProduct, true);
        } else {
            alert("Product name cannot be empty.");
            setSearchTerm('');
        }
    };

    const handleUpdateSaleItem = (id: number, field: keyof SaleItem, value: any) => {
        const updatedItems = activeCart.items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        );
        updateActiveCart({ items: updatedItems });
    
        const updatedItem = updatedItems.find(item => item.id === id);
        if (!updatedItem) return;
    
        // If the price was changed, update the product in the main inventory
        if (field === 'price') {
            onUpdateProductPrice(updatedItem.productId, parseFloat(String(value)) || 0, priceMode);
        }
        // If description is changed, update product in main inventory
        if (field === 'description') {
            onUpdateProductDetails(updatedItem.productId, field, String(value));
        }
    };
    
    const handleRemoveSaleItem = (id: number) => {
        updateActiveCart({ items: activeCart.items.filter(item => item.id !== id) });
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const canAddNew = searchTerm.trim() !== '' && searchResults.length === 0 && currentUser?.role !== 'cashier';
        const resultCount = searchResults.length;
        const itemCount = resultCount + (canAddNew ? 1 : 0);
    
        if (itemCount === 0) return;
    
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % itemCount);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + itemCount) % itemCount);
                break;
            case 'Enter':
                e.preventDefault();
                
                let selectedIndex = highlightedIndex;
                if (selectedIndex === -1) {
                    // If nothing is highlighted, default to the first available option
                    if (itemCount > 0) selectedIndex = 0;
                    else return; // Nothing to select
                }
    
                if (selectedIndex < resultCount) {
                    // It's a product from the search results
                    handleAddToSale(searchResults[selectedIndex]);
                } else if (canAddNew) {
                    // It's the "Add new" option
                    handleCreateAndAddProduct();
                }
                break;
            default:
                break;
        }
    };

    const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            if (canChangePrice) {
                const priceInput = priceInputRefs.current[index];
                priceInput?.focus();
                priceInput?.select();
            } else {
                productSearchRef.current?.focus();
            }
        }
    };

    const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            productSearchRef.current?.focus();
        }
    };

    const handleVoiceSearch = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Sorry, your browser does not support voice recognition.");
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            const term = speechResult;
            setSearchTerm(term);
            setSearchResults(filterProducts(term));
        };

        recognition.onspeechend = () => {
            recognition.stop();
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.start();
    };
    
    const handleBarcodeScanned = (barcode: string) => {
        setIsScannerOpen(false); // Close modal immediately
        const product = products.find(p => p.barcode === barcode);
        if (product) {
            handleAddToSale(product, false);
            productSearchRef.current?.focus();
        } else {
            setSearchTerm(barcode);
            setSearchResults([]); // Ensure search results are cleared
            alert(`Product with barcode "${barcode}" not found.`);
            productSearchRef.current?.focus();
            productSearchRef.current?.select();
        }
    };

    if (viewMode === 'desktop') {
        return (
             <div style={styles.viewContainer}>
                <div style={styles.viewHeader}>
                    <h2>New Sale</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={styles.priceModeSelector}>
                            {[0, 1, 2].map(index => (
                                <label key={index} style={activeCartIndex === index ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                    <input style={styles.priceModeLabel_input} type="radio" name="activeBill" value={index} checked={activeCartIndex === index} onChange={() => onCartChange(index)} />
                                    {index + 1}
                                </label>
                            ))}
                        </div>
                        <div style={styles.priceModeSelector}>
                            <label style={priceMode === 'b2c' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="priceMode" value="b2c" checked={priceMode === 'b2c'} onChange={() => setPriceMode('b2c')} />
                                B2C
                            </label>
                            <label style={priceMode === 'b2b' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="priceMode" value="b2b" checked={priceMode === 'b2b'} onChange={() => setPriceMode('b2b')} />
                                B2B
                            </label>
                        </div>
                         <div style={styles.priceModeSelector}>
                             <label style={activeCart.language === 'english' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="language" value="english" checked={activeCart.language === 'english'} onChange={() => updateActiveCart({ language: 'english' })} />
                                English
                            </label>
                            <label style={activeCart.language === 'tamil' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="language" value="tamil" checked={activeCart.language === 'tamil'} onChange={() => updateActiveCart({ language: 'tamil' })} />
                                Tamil
                            </label>
                        </div>
                        <div style={styles.priceModeSelector}>
                             <label style={viewMode === 'desktop' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="viewMode" value="desktop" checked={viewMode === 'desktop'} onChange={() => setViewMode('desktop')} />
                                Desktop
                            </label>
                            <label style={viewMode === 'mobile' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                <input style={styles.priceModeLabel_input} type="radio" name="viewMode" value="mobile" checked={viewMode === 'mobile'} onChange={() => setViewMode('mobile')} />
                                Mobile
                            </label>
                        </div>
                    </div>
                </div>
                
                <div style={styles.customerSection}>
                     <input 
                        ref={customerNameRef}
                        type="text" 
                        value={activeCart.customerName} 
                        onChange={(e) => updateActiveCart({ customerName: e.target.value })}
                        placeholder="Customer Name"
                        style={styles.customerInput}
                        onKeyDown={(e) => handleCustomerKeyDown(e, 'mobile')}
                     />
                     <div style={{ display: 'flex', flex: 1.5 }}>
                        <input type="text" value={localCountryCode} onChange={handleCountryCodeChange} placeholder="+91" style={styles.countryCodeInput}/>
                        <input ref={customerMobileRef} type="tel" value={localMobileNumber} onChange={handleMobileNumberChange} placeholder="Customer Mobile" style={styles.mobileNumberInput} onKeyDown={(e) => handleCustomerKeyDown(e, 'product')}/>
                     </div>
                     <button onClick={onShowHistory} style={{...styles.button, marginLeft: '0.5rem'}} disabled={!activeCart.customerMobile}>History</button>
                </div>
                
                <div style={{ position: 'relative', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                    <input
                        ref={productSearchRef}
                        type="text"
                        placeholder="Search for a product by name or barcode... or use the mic"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                        style={{ ...styles.input, width: '100%', boxSizing: 'border-box', paddingRight: '85px' }}
                    />
                     <button onClick={() => setIsScannerOpen(true)} style={styles.barcodeScanButton} title="Scan Barcode">
                        <ScanIcon color={'var(--secondary-color)'} />
                    </button>
                     <button onClick={handleVoiceSearch} style={styles.voiceSearchButton} title={isOnline ? "Search with voice" : "Voice search is disabled offline"} disabled={!isOnline}>
                        <MicIcon color={isListening ? 'var(--danger-color)' : (isOnline ? 'var(--secondary-color)' : '#cccccc')} />
                    </button>
                    {searchTerm && (
                        <ul ref={searchResultsContainerRef} style={styles.searchResults}>
                            {searchResults.map((p, index) => (
                                <li key={p.id} onClick={() => handleAddToSale(p)} style={index === highlightedIndex ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem} onMouseEnter={() => setHighlightedIndex(index)} >
                                    {p.description} {p.descriptionTamil && `(${p.descriptionTamil})`} (₹{(priceMode === 'b2b' ? p.b2bPrice : p.b2cPrice).toFixed(1)}) - Stock: {p.stock}
                                </li>
                            ))}
                            {searchResults.length === 0 && searchTerm.trim() !== '' && currentUser?.role !== 'cashier' && (
                                <li onClick={handleCreateAndAddProduct} style={highlightedIndex === searchResults.length ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem} onMouseEnter={() => setHighlightedIndex(searchResults.length)} >
                                    + Add "<strong>{searchTerm}</strong>" as a new product
                                </li>
                            )}
                        </ul>
                    )}
                </div>
                
                <div style={{maxHeight: '40vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px'}}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>S.No.</th>
                                <th style={{...styles.th, width: '50%'}}>Description</th>
                                <th style={styles.th}>Quantity</th>
                                <th style={styles.th}>Price</th>
                                <th style={styles.th}>Total</th>
                                <th style={styles.th}>Return</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeCart.items.map((item, index) => {
                                const itemTotal = item.quantity * item.price;
                                return (
                                    <tr key={item.id} style={item.isReturn ? {backgroundColor: '#ffebee'} : {}}>
                                        <td style={styles.td}>{index + 1}</td>
                                        <td style={styles.td}>
                                            <input
                                                type="text"
                                                value={item.description}
                                                onChange={(e) => handleUpdateSaleItem(item.id, 'description', e.target.value)}
                                                style={styles.wideGridInput}
                                                disabled={!canEditProductDetails}
                                            />
                                        </td>
                                        <td style={styles.td}><input ref={el => { quantityInputRefs.current[index] = el; }} type="number" step="0.001" value={item.quantity} onChange={(e) => handleUpdateSaleItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} style={styles.gridInput} onKeyDown={(e) => handleQuantityKeyDown(e, index)} /></td>
                                        <td style={styles.td}><input ref={el => { priceInputRefs.current[index] = el; }} type="number" step="0.01" value={item.price} onChange={(e) => handleUpdateSaleItem(item.id, 'price', parseFloat(e.target.value) || 0)} style={styles.gridInput} onKeyDown={handlePriceKeyDown} disabled={!canChangePrice} /></td>
                                        <td style={styles.td}>₹{itemTotal.toFixed(1)}</td>
                                        <td style={styles.td}><input type="checkbox" checked={item.isReturn} onChange={(e) => handleUpdateSaleItem(item.id, 'isReturn', e.target.checked)} style={{width: '20px', height: '20px'}} /></td>
                                        <td style={styles.td}><button onClick={() => handleRemoveSaleItem(item.id)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>X</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                     {activeCart.items.length === 0 && <p style={styles.emptyMessage}>No items in sale.</p>}
                </div>

                <div style={styles.totalsSection}>
                    <div><label>Discount (₹)</label><input type="number" step="0.01" value={activeCart.discount} onChange={(e) => updateActiveCart({ discount: parseFloat(e.target.value) || 0 })} style={styles.totalsInput}/></div>
                    <div><label>Tax (%)</label><input type="number" step="0.01" value={activeCart.tax} onChange={(e) => updateActiveCart({ tax: parseFloat(e.target.value) || 0 })} style={styles.totalsInput}/></div>
                    <div>
                        <label>Previous Balance (₹)</label>
                        <input type="number" value={previousBalanceDue.toFixed(2)} style={{...styles.totalsInput, backgroundColor: '#f8f9fa', border: 'none'}} readOnly tabIndex={-1}/>
                    </div>
                     <div>
                        <label>Amount Paid (₹)</label>
                        <input type="number" step="0.01" value={paidAmount} onChange={(e) => {
                            setPaidAmount(parseFloat(e.target.value) || 0);
                            onAmountPaidEdit();
                        }} style={styles.totalsInput}/>
                    </div>
                    <button onClick={onPreview} style={{...styles.button, backgroundColor: 'var(--success-color)'}} disabled={activeCart.items.length === 0 && previousBalanceDue <= 0}>Preview Invoice</button>
                    <div style={styles.grandTotal}>
                        <h3>Grand Total: ₹{total.toFixed(2)}</h3>
                        {finalBalance !== 0 && <h4 style={{color: finalBalance > 0 ? 'var(--danger-color)' : 'var(--success-color)', margin: 0}}>Balance: ₹{finalBalance.toFixed(2)}</h4>}
                    </div>
                </div>
                
                {currentUser?.role === 'super_admin' && (
                    <div style={styles.backupSection}>
                        <h3 style={styles.backupTitle}>Database Backup & Restore</h3>
                        <p style={styles.backupDescription}>Save your entire application database (all shops, products, and sales) to a single file, or restore it from a previous backup.</p>
                        <div style={styles.backupActions}>
                            <button onClick={onSaveBackup} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Save Backup to Disk</button>
                            <label style={{...styles.button, backgroundColor: 'var(--success-color)', cursor: 'pointer'}}>
                                Load Backup from Disk
                                <input type="file" accept=".sqlite,.db" style={{ display: 'none' }} onChange={onRestoreBackup} />
                            </label>
                        </div>
                    </div>
                )}
                {isScannerOpen && <BarcodeScannerModal onScan={handleBarcodeScanned} onClose={() => setIsScannerOpen(false)} />}
            </div>
        );
    }
    
    // --- START OF NEW MOBILE VIEW ---
    return (
        <div style={styles.mobileSingleColumnLayout}>
            <div style={styles.mobileScrollableContent}>
                <div style={styles.mobileSection}>
                    <h3 style={styles.mobileSectionTitle}>Settings</h3>
                     <div style={styles.mobileSettingsGroup}>
                        <p style={styles.mobileSettingsLabel}>Active Bill</p>
                        <div style={styles.priceModeSelector}>
                            {[0, 1, 2].map(index => (
                                <label key={index} style={activeCartIndex === index ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}>
                                    <input style={styles.priceModeLabel_input} type="radio" name="activeBillMobile" value={index} checked={activeCartIndex === index} onChange={() => onCartChange(index)} />
                                    {index + 1}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div style={styles.mobileSettingsGroup}>
                        <p style={styles.mobileSettingsLabel}>Price Mode</p>
                        <div style={styles.priceModeSelector}>
                            <label style={priceMode === 'b2c' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="priceMode" value="b2c" checked={priceMode === 'b2c'} onChange={() => setPriceMode('b2c')} />B2C</label>
                            <label style={priceMode === 'b2b' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="priceMode" value="b2b" checked={priceMode === 'b2b'} onChange={() => setPriceMode('b2b')} />B2B</label>
                        </div>
                    </div>
                    <div style={styles.mobileSettingsGroup}>
                        <p style={styles.mobileSettingsLabel}>Language</p>
                        <div style={styles.priceModeSelector}>
                            <label style={activeCart.language === 'english' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="language" value="english" checked={activeCart.language === 'english'} onChange={() => updateActiveCart({ language: 'english' })} />English</label>
                            <label style={activeCart.language === 'tamil' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="language" value="tamil" checked={activeCart.language === 'tamil'} onChange={() => updateActiveCart({ language: 'tamil' })} />Tamil</label>
                        </div>
                    </div>
                    <div style={styles.mobileSettingsGroup}>
                        <p style={styles.mobileSettingsLabel}>View Mode</p>
                        <div style={styles.priceModeSelector}>
                            <label style={viewMode === 'desktop' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="viewMode" value="desktop" checked={viewMode === 'desktop'} onChange={() => setViewMode('desktop')} />Desktop</label>
                            <label style={viewMode === 'mobile' ? {...styles.priceModeLabel, ...styles.priceModeLabelChecked} : styles.priceModeLabel}><input style={styles.priceModeLabel_input} type="radio" name="viewMode" value="mobile" checked={viewMode === 'mobile'} onChange={() => setViewMode('mobile')} />Mobile</label>
                        </div>
                    </div>
                </div>

                <div style={styles.mobileSection}>
                    <h3 style={styles.mobileSectionTitle}>Customer Details</h3>
                    <input ref={customerNameRef} type="text" value={activeCart.customerName} onChange={(e) => updateActiveCart({ customerName: e.target.value })} placeholder="Customer Name" style={styles.mobileInput} />
                    <div style={{ display: 'flex' }}>
                        <input type="text" value={localCountryCode} onChange={handleCountryCodeChange} placeholder="+91" style={{ ...styles.mobileInput, flex: '0 0 60px', borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }} />
                        <input ref={customerMobileRef} type="tel" value={localMobileNumber} onChange={handleMobileNumberChange} placeholder="Customer Mobile" style={{ ...styles.mobileInput, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} />
                    </div>
                    <button onClick={onShowHistory} style={{...styles.mobileButton, backgroundColor: 'var(--secondary-color)', width: '100%', marginTop: '0.5rem'}} disabled={!activeCart.customerMobile}>View History</button>
                </div>

                <div style={styles.mobileSection}>
                    <h3 style={styles.mobileSectionTitle}>Add Product</h3>
                    <div style={{ position: 'relative' }}>
                        <input ref={productSearchRef} type="text" placeholder="Search or Scan..." value={searchTerm} onChange={handleSearchChange} onKeyDown={handleSearchKeyDown} style={{ ...styles.mobileInput, paddingRight: '50px' }} />
                        <button onClick={() => setIsScannerOpen(true)} style={styles.mobileInputIconButton} title="Scan Barcode"><ScanIcon color="var(--secondary-color)" /></button>
                        {searchTerm && (
                             <ul ref={searchResultsContainerRef} style={styles.mobileInlineSearchResults}>
                                {searchResults.map((p, index) => (
                                    <li key={p.id} onClick={() => handleAddToSale(p)} style={index === highlightedIndex ? {...styles.mobileInlineSearchResultItem, ...styles.highlighted} : styles.mobileInlineSearchResultItem} onMouseEnter={() => setHighlightedIndex(index)}>
                                        <p style={{margin:0, fontWeight: 500}}>{p.description}</p>
                                        <p style={{margin: '0.2rem 0 0 0', color: 'var(--secondary-color)', fontSize: '0.9rem'}}>₹{(priceMode === 'b2b' ? p.b2bPrice : p.b2cPrice).toFixed(1)} | Stock: {p.stock}</p>
                                    </li>
                                ))}
                                {searchResults.length === 0 && searchTerm.trim() !== '' && currentUser?.role !== 'cashier' && (
                                    <li onClick={handleCreateAndAddProduct} style={highlightedIndex === 0 ? {...styles.mobileInlineSearchResultItem, ...styles.highlighted} : styles.mobileInlineSearchResultItem} onMouseEnter={() => setHighlightedIndex(0)}>
                                        + Add "<strong>{searchTerm}</strong>" as new product
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                </div>

                <div style={styles.mobileSection}>
                     <h3 style={styles.mobileSectionTitle}>Bill Items ({activeCart.items.length})</h3>
                     {activeCart.items.length === 0 && <p style={styles.emptyMessage}>No items added yet.</p>}
                     {activeCart.items.map(item => {
                         const itemTotal = item.quantity * item.price;
                         return (
                            <div key={item.id} style={item.isReturn ? {...styles.mobileBillItemCard, ...styles.mobileBillItemCardReturn} : styles.mobileBillItemCard}>
                                <div style={styles.mobileBillItemInfo}>
                                     <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => handleUpdateSaleItem(item.id, 'description', e.target.value)}
                                        style={{ ...styles.mobileInput, marginBottom: '0.25rem', padding: '0.5rem', fontSize: '1rem', fontWeight: 'bold' }}
                                        placeholder="Description"
                                        disabled={!canEditProductDetails}
                                    />
                                    <p style={{ margin: '0.25rem 0', color: 'var(--secondary-color)' }}>
                                        Price: ₹{item.price.toFixed(1)} | Total: ₹{itemTotal.toFixed(1)}
                                    </p>
                                </div>
                                <div style={styles.mobileBillItemControls}>
                                    <div style={styles.mobileQuantityControls}>
                                        <button onClick={() => handleUpdateSaleItem(item.id, 'quantity', item.quantity - 1)} style={styles.mobileRoundButton} disabled={item.quantity <= 1}><MinusIcon size={18} /></button>
                                        <span style={{fontWeight: 500, minWidth: '20px', textAlign: 'center'}}>{item.quantity}</span>
                                        <button onClick={() => handleUpdateSaleItem(item.id, 'quantity', item.quantity + 1)} style={styles.mobileRoundButton}><PlusIcon size={18} /></button>
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                        <label style={{display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem'}}>
                                            <input type="checkbox" checked={item.isReturn} onChange={e => handleUpdateSaleItem(item.id, 'isReturn', e.target.checked)} /> Return
                                        </label>
                                        <button onClick={() => handleRemoveSaleItem(item.id)} style={styles.mobileRoundButton}><TrashIcon size={18} color="var(--danger-color)" /></button>
                                    </div>
                                </div>
                            </div>
                         );
                     })}
                </div>

                <div style={styles.mobileSection}>
                    <h3 style={styles.mobileSectionTitle}>Payment</h3>
                    <div style={styles.mobilePaymentRow}>
                        <span>Discount (₹)</span>
                        <input type="number" step="0.01" value={activeCart.discount} onChange={(e) => updateActiveCart({ discount: parseFloat(e.target.value) || 0 })} style={styles.mobilePaymentInput} />
                    </div>
                     <div style={styles.mobilePaymentRow}>
                        <span>Tax (%)</span>
                        <input type="number" step="0.01" value={activeCart.tax} onChange={(e) => updateActiveCart({ tax: parseFloat(e.target.value) || 0 })} style={styles.mobilePaymentInput} />
                    </div>
                     <div style={styles.mobilePaymentRow}>
                        <span>Previous Balance</span>
                        <span>₹{previousBalanceDue.toFixed(2)}</span>
                    </div>
                    <div style={styles.mobileGrandTotal}>
                        <span>Grand Total</span>
                        <span>₹{total.toFixed(2)}</span>
                    </div>
                    <div style={{...styles.mobilePaymentRow, borderTop: '1px solid var(--border-color)'}}>
                        <span>Amount Paid</span>
                        <input type="number" step="0.01" value={paidAmount} onChange={(e) => {
                            setPaidAmount(parseFloat(e.target.value) || 0);
                            onAmountPaidEdit();
                        }} style={{...styles.mobilePaymentInput, fontWeight: 'bold'}} />
                    </div>
                     {finalBalance > 0 && 
                        <div style={{...styles.mobileGrandTotal, color: 'var(--danger-color)'}}>
                            <span>Balance Due</span>
                            <span>₹{finalBalance.toFixed(2)}</span>
                        </div>
                    }
                </div>

            </div>
            <div style={styles.mobileBottomActionBar}>
                <button onClick={onPreview} style={styles.mobileFinalizeButton} disabled={activeCart.items.length === 0 && previousBalanceDue <= 0}>
                    Preview & Finalize Sale
                </button>
            </div>
             {isScannerOpen && <BarcodeScannerModal onScan={handleBarcodeScanned} onClose={() => setIsScannerOpen(false)} />}
        </div>
    );
};

// --- NEW MULTI-BILL TYPES & DEFAULTS ---
interface CartState {
    items: SaleItem[];
    discount: number;
    tax: number;
    customerName: string;
    customerMobile: string;
    language: 'english' | 'tamil';
}

const defaultCartState: CartState = {
    items: [],
    discount: 0,
    tax: 0,
    customerName: '',
    customerMobile: '',
    language: 'english',
};

// --- SHOP MANAGER MODAL ---
const ShopManagerModal = ({ shops, activeShopId, onSelect, onCreate, onRename, onDelete, onClose, userPlan, onUpgrade }: {
    shops: Shop[],
    activeShopId: number | null,
    onSelect: (shopId: number) => void,
    onCreate: (shopName: string) => void,
    onRename: (shopId: number, newName: string) => void,
    onDelete: (shopId: number) => void,
    onClose: () => void,
    userPlan: UserPlan,
    onUpgrade: () => void,
}) => {
    const [newShopName, setNewShopName] = useState('');
    const [editingShop, setEditingShop] = useState<{ id: number, name: string } | null>(null);
    const newShopInputRef = useRef<HTMLInputElement>(null);
    const isCreateDisabled = userPlan === 'free' && shops.length >= 1;

    useEffect(() => {
        if (!editingShop) {
            newShopInputRef.current?.focus();
        }
    }, [editingShop]);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (isCreateDisabled) {
            onUpgrade();
            return;
        }
        const trimmedName = newShopName.trim();
        if (trimmedName) {
            onCreate(trimmedName);
            setNewShopName('');
        }
    };

    const handleStartRename = (shop: Shop) => {
        setEditingShop({ id: shop.id, name: shop.name });
    };

    const handleCancelRename = () => {
        setEditingShop(null);
    };
    
    const handleSaveRename = () => {
        if (editingShop && editingShop.name.trim()) {
            onRename(editingShop.id, editingShop.name.trim());
            setEditingShop(null);
        }
    };
    
    const handleEditingKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelRename();
        }
    };


    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '600px' }}>
                <h2 style={{ marginTop: 0 }}>Shop Manager</h2>
                <div style={{ marginBottom: '1.5rem', maxHeight: '40vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    {shops.map(shop => (
                        <div
                            key={shop.id}
                            style={shop.id === activeShopId ? {...styles.shopListItem, ...styles.shopListItemActive, padding: '0.5rem 1rem'} : {...styles.shopListItem, padding: '0.5rem 1rem'}}
                        >
                           {editingShop?.id === shop.id ? (
                                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%'}}>
                                    <input 
                                        type="text"
                                        value={editingShop.name}
                                        onChange={(e) => setEditingShop({...editingShop, name: e.target.value})}
                                        onKeyDown={handleEditingKeyDown}
                                        style={{...styles.input, flex: 1, height: '38px', boxSizing: 'border-box'}}
                                        autoFocus
                                    />
                                    <button onClick={handleSaveRename} style={{...styles.actionButton, backgroundColor: 'var(--success-color)'}}>Save</button>
                                    <button onClick={handleCancelRename} style={{...styles.actionButton, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                                </div>
                            ) : (
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer'}} onClick={() => onSelect(shop.id)}>
                                    <span style={{fontWeight: shop.id === activeShopId ? 'bold' : 'normal', flex: 1}}>
                                        {shop.name}
                                        {shop.id === activeShopId && " (Active)"}
                                    </span>
                                    <div style={{display: 'flex', gap: '0.5rem'}} onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleStartRename(shop)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Rename</button>
                                        <button 
                                            onClick={() => onDelete(shop.id)} 
                                            style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}
                                            disabled={shop.id === activeShopId}
                                            title={shop.id === activeShopId ? "Cannot delete the active shop" : "Delete shop"}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                     {shops.length === 0 && <p style={styles.emptyMessage}>No shops created yet.</p>}
                </div>
                <form onSubmit={handleCreate}>
                    <label style={styles.label}>Create New Shop</label>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <input
                            ref={newShopInputRef}
                            type="text"
                            value={newShopName}
                            onChange={e => setNewShopName(e.target.value)}
                            placeholder="New Shop Name"
                            style={{ ...styles.input, flex: 1 }}
                            required
                        />
                        <button type="submit" style={styles.button} title={isCreateDisabled ? "Upgrade to Pro to add more shops" : ""}>{isCreateDisabled ? 'Upgrade to Add' : 'Create'}</button>
                    </div>
                     {isCreateDisabled && <p style={{fontSize: '0.9rem', color: 'var(--secondary-color)', marginTop: '0.5rem'}}>The free plan supports one shop. Please upgrade to Pro for multi-shop management.</p>}
                </form>
                <div style={styles.modalActions}>
                    <button onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)' }}>Close</button>
                </div>
            </div>
        </div>
    );
};


// --- INITIAL SETUP MODAL ---
const InitialSetupModal = ({ onCreate }: { onCreate: (shopName: string) => void }) => {
    const [shopName, setShopName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = shopName.trim();
        if (trimmedName) {
            onCreate(trimmedName);
        }
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '500px', textAlign: 'center' }}>
                <h2 style={{ marginTop: 0 }}>Welcome!</h2>
                <p>To get started, please create your first shop.</p>
                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={shopName}
                        onChange={e => setShopName(e.target.value)}
                        placeholder="Your Shop Name (e.g., Main Branch)"
                        style={{ ...styles.input, width: '80%', marginBottom: '1rem' }}
                        required
                    />
                    <button type="submit" style={styles.button}>Create Shop</button>
                </form>
            </div>
        </div>
    );
};

// --- RESTORE PROGRESS MODAL ---
const RestoreProgressModal = ({ percentage, eta, message }: { percentage: number; eta: string; message: string; }) => (
    <div style={styles.modalBackdrop}>
        <div style={{...styles.modalContent, maxWidth: '400px', textAlign: 'center'}}>
            <h3 style={{marginTop: 0}}>{message}</h3>
            <p>Please wait, this may take a few moments for large files. Do not close this window.</p>
            <div style={{
                width: '100%',
                backgroundColor: 'var(--background-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid var(--border-color)',
                marginBottom: '1rem',
            }}>
                <div style={{
                    width: `${percentage}%`,
                    backgroundColor: 'var(--success-color)',
                    height: '24px',
                    transition: 'width 0.2s ease-in-out',
                    textAlign: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    lineHeight: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {Math.round(percentage)}%
                </div>
            </div>
            {percentage < 100 && <p>Estimated time remaining: <strong>{eta}</strong></p>}
        </div>
    </div>
);

// --- LOGIN VIEW STYLES ---
const loginStyles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--background-color)',
    },
    card: {
        width: '100%',
        maxWidth: '400px',
        padding: '2rem',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    },
    title: {
        textAlign: 'center',
        marginTop: 0,
        color: 'var(--primary-color)',
    },
    subtitle: {
        textAlign: 'center',
        color: 'var(--secondary-color)',
        marginBottom: '2rem',
    },
    input: {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        marginBottom: '1rem',
        boxSizing: 'border-box',
    },
    button: {
        width: '100%',
        padding: '0.75rem 1.25rem',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: 'bold',
    },
    error: {
        color: 'var(--danger-color)',
        backgroundColor: '#ffebee',
        border: '1px solid var(--danger-color)',
        borderRadius: '6px',
        padding: '0.75rem',
        marginBottom: '1rem',
        textAlign: 'center',
    },
};

// --- LOGIN VIEW COMPONENT ---
const LoginView = ({ onLoginSuccess }: { onLoginSuccess: (user: User) => void }) => {
    type View = 'loading' | 'create_super_admin' | 'login';
    const [view, setView] = useState<View>('loading');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const userInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const checkInitialSetup = async () => {
            if (!db) return;
            try {
                const users = sqlResultToObjects(db.exec("SELECT id FROM users LIMIT 1"));
                if (users.length === 0) {
                    setView('create_super_admin');
                } else {
                    setView('login');
                }
            } catch (e) {
                console.error("Error checking for users:", e);
                setError("Could not verify database. Please refresh.");
            }
        };
        // Delay check to ensure DB is initialized by the parent
        setTimeout(checkInitialSetup, 100);
    }, []);

    useEffect(() => {
        userInputRef.current?.focus();
    }, [view]);

    const handleCreateSuperAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 4) {
            setError('Password must be at least 4 characters long.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const hashedPassword = await hashPassword(password);
            db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username.toLowerCase(), hashedPassword, 'super_admin']);
            await saveDbToIndexedDB();
            const newUser = sqlResultToObjects(db.exec("SELECT * FROM users WHERE username = ?", [username.toLowerCase()]))[0];
            onLoginSuccess(newUser);
        } catch (err: any) {
            setError(err.message.includes('UNIQUE constraint failed') ? 'Username already exists.' : 'Failed to create user. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const result = sqlResultToObjects(db.exec("SELECT * FROM users WHERE username = ?", [username.toLowerCase()]));
            if (result.length === 0) {
                setError('Invalid username or password.');
                return;
            }
            const user = result[0];
            const enteredPasswordHash = await hashPassword(password);
            if (user.password_hash === enteredPasswordHash) {
                onLoginSuccess({ id: user.id, username: user.username, role: user.role, shop_id: user.shop_id });
            } else {
                setError('Invalid username or password.');
            }
        } catch (err) {
            setError('An error occurred during login. Please try again.');
        } finally {
            setIsLoading(false);
            setPassword('');
        }
    };

    const renderContent = () => {
        switch (view) {
            case 'create_super_admin':
                return (
                    <>
                        <h2 style={loginStyles.title}>Create Super Admin</h2>
                        <p style={loginStyles.subtitle}>Set up the first administrator account for the system.</p>
                        <form onSubmit={handleCreateSuperAdmin}>
                            <input ref={userInputRef} style={loginStyles.input} type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                            <input style={loginStyles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 4 chars)" required />
                            <input style={loginStyles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm Password" required />
                            <button style={loginStyles.button} type="submit" disabled={isLoading}>{isLoading ? 'Creating...' : 'Create Admin'}</button>
                        </form>
                    </>
                );
            case 'login':
                return (
                    <>
                        <h2 style={loginStyles.title}>Login</h2>
                        <form onSubmit={handleLogin}>
                             <input ref={userInputRef} style={loginStyles.input} type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                             <input style={loginStyles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                             <button style={loginStyles.button} type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</button>
                        </form>
                    </>
                );
            default:
                return <p>Loading...</p>;
        }
    };

    return (
        <div style={loginStyles.container}>
            <div style={loginStyles.card}>
                {error && <p style={loginStyles.error}>{error}</p>}
                {renderContent()}
            </div>
        </div>
    );
};

// --- DROPDOWN NAVIGATION COMPONENT ---
const DropdownNav = ({ activeView, onSelectView, disabled, currentUser }: { activeView: string, onSelectView: (view: string) => void, disabled: boolean, currentUser: User | null }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const allNavItems = [
        { key: 'sales', label: 'New Sale', roles: ['super_admin', 'shop_admin', 'cashier'] },
        { key: 'products', label: 'Product Inventory', roles: ['super_admin', 'shop_admin', 'cashier'] },
        { key: 'expenses', label: 'Expenses', roles: ['super_admin', 'shop_admin'] },
        { key: 'balance_due', label: 'Balance Due', roles: ['super_admin', 'shop_admin'] },
        { key: 'customers', label: 'Customers', roles: ['super_admin', 'shop_admin'] },
        { key: 'reports', label: 'Reports', roles: ['super_admin', 'shop_admin'] },
        { key: 'settings', label: 'Settings', roles: ['super_admin', 'shop_admin'] },
    ];
    
    const navItems = allNavItems.filter(item => currentUser && item.roles.includes(currentUser.role));
    const currentLabel = navItems.find(item => item.key === activeView)?.label || 'Menu';


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (view: string) => {
        onSelectView(view);
        setIsOpen(false);
    };

    return (
        <div style={styles.dropdownContainer} ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} style={styles.dropdownButton} disabled={disabled}>
                {currentLabel}
                <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
            </button>
            {isOpen && (
                <ul style={styles.dropdownMenu}>
                    {navItems.map(item => (
                        <li key={item.key} onClick={() => handleSelect(item.key)} style={activeView === item.key ? {...styles.dropdownMenuItem, ...styles.dropdownMenuItemActive} : styles.dropdownMenuItem}>
                            {item.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// --- BALANCE DUE VIEW ---
const BalanceDueView = ({ salesHistory, customers, onSettlePayment }: { salesHistory: SaleRecord[], customers: Customer[], onSettlePayment: (saleId: string, amount: number) => void }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    const salesWithBalance = salesHistory
        .filter(s => s.balance_due > 0.01)
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filteredSales = salesWithBalance.filter(s =>
        (s.customerName && s.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.customerMobile && s.customerMobile.includes(searchQuery)) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSettleClick = (sale: SaleRecord) => {
        setSelectedSale(sale);
        setPaymentAmount(sale.balance_due.toFixed(2));
    };

    const handleConfirmPayment = () => {
        if (selectedSale) {
            const amount = parseFloat(paymentAmount);
            if (!isNaN(amount) && amount > 0) {
                onSettlePayment(selectedSale.id, amount);
                setSelectedSale(null);
                setPaymentAmount('');
            } else {
                alert("Please enter a valid payment amount.");
            }
        }
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Balance Due Payments</h2>
                <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <SearchIcon color="var(--secondary-color)" />
                    </span>
                    <input
                        type="search"
                        placeholder="Search by customer, mobile, or invoice ID..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...styles.input, width: '400px', paddingLeft: '40px' }}
                        aria-label="Search balance due records"
                    />
                </div>
            </div>
             {filteredSales.length > 0 ? (
                 <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Date</th>
                            <th style={styles.th}>Invoice ID</th>
                            <th style={styles.th}>Customer</th>
                            <th style={styles.th}>Mobile</th>
                            <th style={styles.th}>Total Bill</th>
                            <th style={{...styles.th, color: 'var(--danger-color)'}}>Balance Due</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSales.map(s => (
                            <tr key={s.id}>
                                <td style={styles.td}>{new Date(s.date).toLocaleDateString()}</td>
                                <td style={styles.td}>{s.id}</td>
                                <td style={styles.td}>{s.customerName || 'N/A'}</td>
                                <td style={styles.td}>{s.customerMobile || 'N/A'}</td>
                                <td style={styles.td}>₹{s.total.toFixed(2)}</td>
                                <td style={{...styles.td, color: 'var(--danger-color)', fontWeight: 'bold'}}>₹{s.balance_due.toFixed(2)}</td>
                                <td style={styles.td}>
                                    <button onClick={() => handleSettleClick(s)} style={{...styles.button, padding: '0.25rem 0.75rem', fontSize: '0.9rem'}}>Settle Payment</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                 <p style={styles.emptyMessage}>
                    {searchQuery ? `No records found matching "${searchQuery}".` : "No outstanding balances found. Great job!"}
                </p>
            )}

            {selectedSale && (
                <div style={styles.modalBackdrop}>
                    <div style={{...styles.modalContent, maxWidth: '450px'}}>
                        <h3 style={{marginTop: 0}}>Settle Payment for Invoice {selectedSale.id}</h3>
                        <p>Customer: <strong>{selectedSale.customerName}</strong></p>
                        <p>Total Due: <strong style={{color: 'var(--danger-color)'}}>₹{selectedSale.balance_due.toFixed(2)}</strong></p>
                        <label style={styles.label}>Amount to Pay</label>
                        <input
                            type="number"
                            step="0.01"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            style={styles.input}
                            autoFocus
                        />
                         <div style={styles.modalActions}>
                            <button onClick={() => setSelectedSale(null)} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                            <button onClick={handleConfirmPayment} style={{...styles.button, backgroundColor: 'var(--success-color)'}}>Confirm Payment</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- SETTINGS VIEW ---
const SettingsView = ({ billSettings, onSave, onPreview, activeShopName, onRenameShop, userPlan, onUpgrade }: {
    billSettings: BillSettings,
    onSave: (settings: BillSettings) => void,
    onPreview: () => void,
    activeShopName: string,
    onRenameShop: (newName: string) => void,
    userPlan: UserPlan,
    onUpgrade: () => void
}) => {
    const [settings, setSettings] = useState(billSettings);
    const [shopName, setShopName] = useState(activeShopName);
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setSettings(billSettings);
        setShopName(activeShopName);
    }, [billSettings, activeShopName]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };
    
    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setSettings(prev => ({
            ...prev,
            displayOptions: {
                ...prev.displayOptions,
                [name]: checked
            }
        }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSettings(prev => ({ ...prev, logo: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSaveShopName = () => {
        const trimmedName = shopName.trim();
        if (trimmedName && trimmedName !== activeShopName) {
            onRenameShop(trimmedName);
        } else {
            setShopName(activeShopName); // Reset if empty or unchanged
        }
    };
    
    const isProFeature = (feature: keyof BillSettings) => {
        if (userPlan === 'pro') return false;
        const proFeatures: (keyof BillSettings)[] = ['logo', 'gstin'];
        if (feature === 'format' && (settings.format === 'detailed' || settings.format === 'gst')) {
            return true;
        }
        return proFeatures.includes(feature);
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Settings</h2>
                <div>
                    <button onClick={onPreview} style={{...styles.button, backgroundColor: 'var(--secondary-color)', marginRight: '1rem'}}>Preview Bill</button>
                    <button onClick={() => onSave(settings)} style={styles.button}>Save Settings</button>
                </div>
            </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start'}}>
                <div style={styles.settingsCard}>
                    <h3 style={{marginTop: 0}}>Shop Information</h3>
                    <label style={styles.label}>Shop Name</label>
                    <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem'}}>
                        <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} style={{...styles.input, flex: 1}} />
                        <button onClick={handleSaveShopName} style={styles.button}>Rename</button>
                    </div>

                    <label style={styles.label}>Shop Address</label>
                    <textarea name="shopAddress" value={settings.shopAddress} onChange={handleChange} style={{...styles.input, height: '80px', resize: 'vertical'}} />
                    
                    <label style={styles.label}>Shop Tagline / Slogan (Optional)</label>
                    <input type="text" name="tagline" value={settings.tagline} onChange={handleChange} style={styles.input} />

                    <label style={styles.label}>Footer Notes (Optional)</label>
                    <input type="text" name="footerNotes" value={settings.footerNotes} onChange={handleChange} style={styles.input} />

                     <div style={{position: 'relative'}}>
                        <label style={styles.label}>GSTIN (Optional)</label>
                        <input type="text" name="gstin" value={settings.gstin} onChange={handleChange} style={styles.input} disabled={isProFeature('gstin')} />
                        {isProFeature('gstin') && <span style={styles.proBadgeLarge} onClick={onUpgrade}>PRO</span>}
                    </div>

                     <div style={{position: 'relative'}}>
                        <label style={styles.label}>Shop Logo (Optional)</label>
                        <input type="file" accept="image/*" ref={logoInputRef} onChange={handleLogoChange} style={{display: 'none'}} disabled={isProFeature('logo')} />
                        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                            <button onClick={() => logoInputRef.current?.click()} style={styles.button} disabled={isProFeature('logo')}>Upload Logo</button>
                            {settings.logo && <img src={settings.logo} alt="logo preview" style={{maxHeight: '50px', maxWidth: '150px', border: '1px solid var(--border-color)'}} />}
                        </div>
                        {isProFeature('logo') && <span style={styles.proBadgeLarge} onClick={onUpgrade}>PRO</span>}
                    </div>
                </div>

                <div style={styles.settingsCard}>
                    <h3 style={{marginTop: 0}}>Invoice / Bill Customization</h3>
                    <div style={{position: 'relative'}}>
                        <label style={styles.label}>Bill Format</label>
                        <select name="format" value={settings.format} onChange={handleChange} style={styles.input} >
                            <option value="simple">Simple (Item, Qty, Price, Total)</option>
                            <option value="detailed" disabled={userPlan === 'free'}>Detailed (Includes discount, tax, balance)</option>
                            <option value="gst" disabled={userPlan === 'free'}>GST Ready (Includes HSN, GSTIN)</option>
                        </select>
                        {isProFeature('format') && <span style={styles.proBadgeLarge} onClick={onUpgrade}>PRO</span>}
                    </div>
                    
                    <label style={styles.label}>Invoice Layout</label>
                    <select name="layout" value={settings.layout || 'default'} onChange={handleChange} style={styles.input}>
                        <option value="default">Default (Customer details at top)</option>
                        <option value="modern">Modern (Customer details at bottom)</option>
                    </select>

                    <label style={styles.label}>Paper Size</label>
                    <select name="size" value={settings.size} onChange={handleChange} style={styles.input}>
                        <option value="3-inch">3-inch Thermal</option>
                        <option value="4-inch">4-inch Thermal</option>
                        <option value="A4">A4</option>
                        <option value="A5">A5</option>
                        <option value="custom">Custom Width</option>
                    </select>

                    {settings.size === 'custom' && (
                        <div>
                            <label style={styles.label}>Custom Paper Width (e.g., 80mm, 5cm, 3in)</label>
                            <input name="customWidth" value={settings.customWidth} onChange={handleChange} style={styles.input} />
                        </div>
                    )}
                    
                    <h4 style={{marginTop: '2rem'}}>Display Options</h4>
                     <div style={styles.checkboxGrid}>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showLogo" checked={settings.displayOptions.showLogo} onChange={handleCheckboxChange} /> Show Logo</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showShopName" checked={settings.displayOptions.showShopName} onChange={handleCheckboxChange} /> Show Shop Name</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showShopAddress" checked={settings.displayOptions.showShopAddress} onChange={handleCheckboxChange} /> Show Address</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showGstin" checked={settings.displayOptions.showGstin} onChange={handleCheckboxChange} /> Show GSTIN</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showTagline" checked={settings.displayOptions.showTagline} onChange={handleCheckboxChange} /> Show Tagline</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" name="showFooterNotes" checked={settings.displayOptions.showFooterNotes} onChange={handleCheckboxChange} /> Show Footer Notes</label>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- CUSTOM HOOK FOR SHOP MANAGEMENT ---
const useShopManagement = (db: any, currentUser: User | null) => {
    const [shops, setShops] = useState<Shop[]>([]);
    const [activeShopId, setActiveShopId] = useState<number | null>(null);

    const loadShops = useCallback(() => {
        if (!db) return { hasShops: false };
        const shopsData = sqlResultToObjects(db.exec("SELECT id, name, nextProductId FROM shops"));
        setShops(shopsData);
        if (shopsData.length > 0 && !activeShopId) {
            // Set initial active shop based on user's saved shop_id or the first shop
            const initialShopId = currentUser?.shop_id && shopsData.some(s => s.id === currentUser.shop_id)
                ? currentUser.shop_id
                : shopsData[0].id;
            setActiveShopId(initialShopId);
        }
        return { hasShops: shopsData.length > 0 };
    }, [db, activeShopId, currentUser?.shop_id]);

    const createShop = useCallback(async (shopName: string): Promise<number | null> => {
        if (!db) return null;
        const newShopId = Date.now();
        db.run("INSERT INTO shops (id, name, nextProductId) VALUES (?, ?, ?)", [newShopId, shopName, 1]);
        await saveDbToIndexedDB();
        loadShops();
        return newShopId;
    }, [db, loadShops]);

    const renameShop = useCallback(async (shopId: number, newName: string) => {
        if (!db) return;
        const trimmedName = newName.trim();
        if (!trimmedName) {
            alert("Shop name cannot be empty.");
            return;
        }
        db.run("UPDATE shops SET name = ? WHERE id = ?", [trimmedName, shopId]);
        await saveDbToIndexedDB();
        loadShops();
        alert(`Shop renamed to "${trimmedName}"`);
    }, [db, loadShops]);

    const deleteShop = useCallback(async (shopId: number) => {
        if (!db) return;
        try {
            db.exec("BEGIN TRANSACTION;");
            const saleIdsResult = db.exec("SELECT id FROM sales_history WHERE shop_id = ?", [shopId]);
            const saleIds = sqlResultToObjects(saleIdsResult).map((s: any) => s.id);
            if (saleIds.length > 0) {
                const placeholders = saleIds.map(() => '?').join(',');
                db.run(`DELETE FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);
            }
            db.run("DELETE FROM sales_history WHERE shop_id = ?", [shopId]);
            db.run("DELETE FROM products WHERE shop_id = ?", [shopId]);
            db.run("DELETE FROM expenses WHERE shop_id = ?", [shopId]);
            db.run("UPDATE users SET shop_id = NULL WHERE shop_id = ?", [shopId]);
            db.run("DELETE FROM shops WHERE id = ?", [shopId]);
            db.exec("COMMIT;");
            await saveDbToIndexedDB();
            loadShops();
        } catch (e) {
            db.exec("ROLLBACK;");
            console.error("Shop deletion transaction failed:", e);
            throw new Error("An error occurred while deleting the shop. The operation has been rolled back.");
        }
    }, [db, loadShops]);
    
    const selectShop = useCallback((shopId: number) => {
        setActiveShopId(shopId);
        if (currentUser && currentUser.role !== 'super_admin') {
            db.run("UPDATE users SET shop_id = ? WHERE id = ?", [shopId, currentUser.id]);
            saveDbToIndexedDB();
        }
    }, [db, currentUser]);

    return {
        shops,
        activeShopId,
        activeShop: shops.find(s => s.id === activeShopId),
        loadShops,
        createShop,
        renameShop,
        deleteShop,
        selectShop,
    };
};


// --- MAIN APP COMPONENT ---
const App = () => {
    const [dbReady, setDbReady] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const { shops, activeShopId, activeShop, loadShops, createShop, renameShop, deleteShop, selectShop } = useShopManagement(db, currentUser);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    const [carts, setCarts] = useState<CartState[]>([
        JSON.parse(JSON.stringify(defaultCartState)),
        JSON.parse(JSON.stringify(defaultCartState)),
        JSON.parse(JSON.stringify(defaultCartState)),
    ]);
    const [activeCartIndex, setActiveCartIndex] = useState(0);
    const [paidAmounts, setPaidAmounts] = useState<number[]>([0, 0, 0]);
    const [isAmountPaidEdited, setIsAmountPaidEdited] = useState<boolean[]>([false, false, false]);

    const activeCart = carts[activeCartIndex];
    const paidAmount = paidAmounts[activeCartIndex];

    const [view, setView] = useState('sales');
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
    
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
    const [confirmation, setConfirmation] = useState({ message: '', onConfirm: () => {} });

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyMobile, setHistoryMobile] = useState('');
    
    const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
    const [previewSale, setPreviewSale] = useState<any>(null);
    const [isPreviewingNewSale, setIsPreviewingNewSale] = useState(false);
    
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [bulkAddFileSrc, setBulkAddFileSrc] = useState<string | null>(null);
    const [bulkAddFileType, setBulkAddFileType] = useState<'image' | 'pdf' | 'dual-pdf' | null>(null);
    const [bulkAddPdfFileNames, setBulkAddPdfFileNames] = useState<{ b2b: string, b2c: string } | null>(null);
    const [bulkAddProducts, setBulkAddProducts] = useState<EditableProduct[]>([]);
    const [isBulkAddLoading, setIsBulkAddLoading] = useState(false);
    const [bulkAddError, setBulkAddError] = useState<string | null>(null);
    
    const [isPdfUploadModalOpen, setIsPdfUploadModalOpen] = useState(false);
    
    const [isShopManagerOpen, setIsShopManagerOpen] = useState(false);
    const [isInitialSetup, setIsInitialSetup] = useState(false);

    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [restoreProgress, setRestoreProgress] = useState({ percentage: 0, eta: '...', message: 'Initializing...' });

    const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    
    const [billSettings, setBillSettings] = useState<BillSettings>(defaultBillSettings);
    const [isBillSettingsPreviewOpen, setIsBillSettingsPreviewOpen] = useState(false);

    const [userPlan, setUserPlan] = useState<UserPlan>('free');
    const [aiUsageCount, setAiUsageCount] = useState(0);

    // --- DB & AUTH ---
    useEffect(() => {
        initDb().then(() => setDbReady(true));

        const updateOnlineStatus = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        const storedViewMode = localStorage.getItem('pos-view-mode');
        if (storedViewMode === 'mobile' || storedViewMode === 'desktop') {
            setViewMode(storedViewMode as 'desktop' | 'mobile');
        } else if (window.innerWidth < 768) {
            setViewMode('mobile');
        }

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);
    
    useEffect(() => {
        localStorage.setItem('pos-view-mode', viewMode);
    }, [viewMode]);
    
    useEffect(() => {
        if (!dbReady) return;
        const storedPlan = localStorage.getItem('userPlan');
        if (storedPlan === 'pro') setUserPlan('pro');
        
        const storedAiUsage = localStorage.getItem('aiUsageCount');
        if(storedAiUsage) setAiUsageCount(parseInt(storedAiUsage, 10));

    }, [dbReady, activeShopId]);
    
    const handleLoginSuccess = (user: User) => {
        setCurrentUser(user);
        setIsLoggedIn(true);
        // loadShops is now called inside the effect below
    };
    
    useEffect(() => {
        if (isLoggedIn) {
            const { hasShops } = loadShops();
            if (!hasShops) {
                setIsInitialSetup(true);
            }
        }
    }, [isLoggedIn, loadShops]);

    const handleLogout = () => {
        setIsLoggedIn(false);
        setCurrentUser(null);
        // Resetting shop state is handled by the hook re-initializing
        setProducts([]);
        setCustomers([]);
        setSalesHistory([]);
        setExpenses([]);
        setCarts([
            JSON.parse(JSON.stringify(defaultCartState)),
            JSON.parse(JSON.stringify(defaultCartState)),
            JSON.parse(JSON.stringify(defaultCartState)),
        ]);
    };

    // --- DATA LOADING & SAVING ---
    useEffect(() => {
        if (activeShopId && db) {
            loadShopData(activeShopId);
            const storedSettings = localStorage.getItem(`billSettings_${activeShopId}`);
            const baseSettings = storedSettings ? JSON.parse(storedSettings) : defaultBillSettings;
            if (activeShop && !baseSettings.shopNameEdited) {
                baseSettings.shopName = activeShop.name;
            }
            setBillSettings(baseSettings);
        }
    }, [activeShopId, db, activeShop]);

    const loadShopData = (shopId: number) => {
        if (!db) return;
        // Products
        const productsData = sqlResultToObjects(db.exec("SELECT * FROM products WHERE shop_id = ?", [shopId]));
        setProducts(productsData);

        // Sales History
        const salesData = sqlResultToObjects(db.exec("SELECT * FROM sales_history WHERE shop_id = ? ORDER BY date DESC", [shopId]));
        const salesWithItems = salesData.map((sale: any) => {
            const items = sqlResultToObjects(db.exec("SELECT * FROM sale_items WHERE sale_id = ?", [sale.id]));
            return { ...sale, items };
        });
        setSalesHistory(salesWithItems);
        
        // Customers (Assuming customers are global, not per-shop for simplicity)
        const customerData = sqlResultToObjects(db.exec("SELECT * FROM customers"));
        setCustomers(customerData);
        
        // Expenses
        const expenseData = sqlResultToObjects(db.exec("SELECT * FROM expenses WHERE shop_id = ? ORDER BY date DESC", [shopId]));
        setExpenses(expenseData);
    };
    
    // --- SHOP MANAGEMENT ---
    const handleCreateShop = async (shopName: string) => {
        const newShopId = await createShop(shopName);
        if (newShopId) {
            setIsInitialSetup(false);
            setIsShopManagerOpen(false);
            selectShop(newShopId); // Switch to the new shop
        }
    };
    
    const handleSelectShop = (shopId: number) => {
        selectShop(shopId);
        setIsShopManagerOpen(false);
        setView('sales');
    };

    const handleRenameShopInSettings = async (newName: string) => {
        if (!activeShopId) return;
        await renameShop(activeShopId, newName);
        // Update bill settings if shop name isn't custom-edited
        const storedSettings = localStorage.getItem(`billSettings_${activeShopId}`);
        const currentSettings = storedSettings ? JSON.parse(storedSettings) : defaultBillSettings;
        if (!currentSettings.shopNameEdited) {
            const updatedSettings = { ...currentSettings, shopName: newName.trim() };
            setBillSettings(updatedSettings);
            localStorage.setItem(`billSettings_${activeShopId}`, JSON.stringify(updatedSettings));
        }
    };
    
    const handleDeleteShop = (shopId: number) => {
        if (shopId === activeShopId) {
            alert("You cannot delete the currently active shop.");
            return;
        }
        
        const shopToDelete = shops.find(s => s.id === shopId);
        if (!shopToDelete) return;

        setConfirmation({
            message: `Are you sure you want to delete the shop "${shopToDelete.name}"? All associated products, sales history, and expenses for this shop will be permanently removed. This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await deleteShop(shopId);
                    setIsConfirmationModalOpen(false);
                    setIsShopManagerOpen(false); // Close modal on success
                    alert(`Shop "${shopToDelete.name}" has been deleted.`);
                } catch (error: any) {
                    alert(error.message);
                    setIsConfirmationModalOpen(false);
                }
            }
        });
        setIsConfirmationModalOpen(true);
    };


    // --- PRODUCT MANAGEMENT ---
    const handleAddProduct = (productData: Omit<Product, 'id'>) => {
        if (!db || !activeShop) return;
        
        const newProductId = activeShop.nextProductId;
        db.run(
            "INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [newProductId, activeShopId, productData.description, productData.descriptionTamil, productData.barcode, productData.b2bPrice, productData.b2cPrice, productData.stock, productData.category, productData.hsnCode]
        );
        db.run("UPDATE shops SET nextProductId = ? WHERE id = ?", [newProductId + 1, activeShopId]);
        saveDbToIndexedDB().then(() => {
            loadShopData(activeShopId!);
            loadShops(); // To update nextProductId in state
            setIsProductModalOpen(false);
        });
    };

    const handleUpdateProduct = (product: Product) => {
        if (!db || !activeShopId) return;
        db.run(
            "UPDATE products SET description = ?, descriptionTamil = ?, barcode = ?, b2bPrice = ?, b2cPrice = ?, stock = ?, category = ?, hsnCode = ? WHERE id = ? AND shop_id = ?",
            [product.description, product.descriptionTamil, product.barcode, product.b2bPrice, product.b2cPrice, product.stock, product.category, product.hsnCode, product.id, activeShopId]
        );
        saveDbToIndexedDB().then(() => {
            loadShopData(activeShopId);
            setIsProductModalOpen(false);
            setEditingProduct(null);
        });
    };
    
    const handleDeleteProduct = (productId: number) => {
        if (!db || !activeShopId) return;
        const product = products.find(p => p.id === productId);
        if (!product) return;
        setConfirmation({
            message: `Are you sure you want to delete "${product.description}"? This cannot be undone.`,
            onConfirm: () => {
                db.run("DELETE FROM products WHERE id = ? AND shop_id = ?", [productId, activeShopId]);
                saveDbToIndexedDB().then(() => {
                    loadShopData(activeShopId);
                    setIsConfirmationModalOpen(false);
                });
            }
        });
        setIsConfirmationModalOpen(true);
    };

    const handleDeleteSelectedProducts = () => {
        if (selectedProductIds.length === 0) return;
        setConfirmation({
            message: `Are you sure you want to delete ${selectedProductIds.length} selected products? This action cannot be undone.`,
            onConfirm: () => {
                if (!db || !activeShopId) {
                    setIsConfirmationModalOpen(false);
                    return;
                }
                const placeholders = selectedProductIds.map(() => '?').join(',');
                db.run(`DELETE FROM products WHERE id IN (${placeholders}) AND shop_id = ?`, [...selectedProductIds, activeShopId]);
                saveDbToIndexedDB().then(() => {
                    loadShopData(activeShopId);
                    setSelectedProductIds([]);
                    setIsConfirmationModalOpen(false);
                });
            }
        });
        setIsConfirmationModalOpen(true);
    };

    // --- CUSTOMER MANAGEMENT ---
    const handleAddCustomer = (customerData: Omit<Customer, 'id'>) => {
        if (!db) return;
        try {
            db.run("INSERT INTO customers (name, mobile) VALUES (?, ?)", [customerData.name, customerData.mobile]);
            saveDbToIndexedDB().then(() => {
                loadShopData(activeShopId!); // reload all data, which includes customers
                setIsCustomerModalOpen(false);
            });
        } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed')) {
                alert('A customer with this mobile number already exists.');
            } else {
                alert('An error occurred while adding the customer.');
            }
        }
    };

    const handleUpdateCustomer = (customer: Customer) => {
        if (!db) return;
        try {
            db.run("UPDATE customers SET name = ?, mobile = ? WHERE id = ?", [customer.name, customer.mobile, customer.id]);
            saveDbToIndexedDB().then(() => {
                loadShopData(activeShopId!);
                setIsCustomerModalOpen(false);
                setEditingCustomer(null);
            });
        } catch (e: any) {
             if (e.message.includes('UNIQUE constraint failed')) {
                alert('A customer with this mobile number already exists.');
            } else {
                alert('An error occurred while updating the customer.');
            }
        }
    };
    
    const handleDeleteCustomer = (customer: Customer) => {
         setConfirmation({
            message: `Are you sure you want to delete customer "${customer.name}"? This will not delete their sales history but will remove them from the customer list.`,
            onConfirm: () => {
                if (!db) {
                    setIsConfirmationModalOpen(false);
                    return;
                }
                db.run("DELETE FROM customers WHERE id = ?", [customer.id]);
                saveDbToIndexedDB().then(() => {
                    loadShopData(activeShopId!);
                    setIsConfirmationModalOpen(false);
                });
            }
        });
        setIsConfirmationModalOpen(true);
    };

    // --- EXPENSE MANAGEMENT ---
    const handleExpenseAdd = (expenseData: Omit<Expense, 'id'>) => {
        if (!db || !activeShopId) return;
        db.run(
            "INSERT INTO expenses (shop_id, date, description, category, amount) VALUES (?, ?, ?, ?, ?)",
            [expenseData.shop_id, expenseData.date, expenseData.description, expenseData.category, expenseData.amount]
        );
        saveDbToIndexedDB().then(() => loadShopData(activeShopId));
    };

    const handleExpenseDelete = (expenseId: number) => {
        if (!db || !activeShopId) return;
        setConfirmation({
            message: `Are you sure you want to delete this expense record? This cannot be undone.`,
            onConfirm: () => {
                db.run("DELETE FROM expenses WHERE id = ? AND shop_id = ?", [expenseId, activeShopId]);
                saveDbToIndexedDB().then(() => {
                    loadShopData(activeShopId);
                    setIsConfirmationModalOpen(false);
                });
            }
        });
        setIsConfirmationModalOpen(true);
    };

    // --- SALES & CART MANAGEMENT ---
    const updateActiveCart = (updates: Partial<CartState>) => {
        setCarts(prevCarts => {
            const newCarts = [...prevCarts];
            newCarts[activeCartIndex] = { ...newCarts[activeCartIndex], ...updates };
            return newCarts;
        });
    };

    const setPaidAmountForCart = (amount: number) => {
        setPaidAmounts(prev => {
            const newAmounts = [...prev];
            newAmounts[activeCartIndex] = amount;
            return newAmounts;
        });
    };

    const handleAmountPaidEditForCart = () => {
        setIsAmountPaidEdited(prev => {
            const newEdits = [...prev];
            newEdits[activeCartIndex] = true;
            return newEdits;
        });
    };
    
    const { total, subtotal } = useMemo(() => {
        const currentSubtotal = activeCart.items.reduce((acc, item) => {
            const itemTotal = item.quantity * item.price;
            return item.isReturn ? acc - itemTotal : acc + itemTotal;
        }, 0);

        const discountAmount = activeCart.discount;
        const taxAmount = (currentSubtotal - discountAmount) * (activeCart.tax / 100);
        const currentTotal = currentSubtotal - discountAmount + taxAmount;

        return { total: currentTotal, subtotal: currentSubtotal };
    }, [activeCart.items, activeCart.discount, activeCart.tax]);
    
    const previousBalanceDue = useMemo(() => {
        if (!activeCart.customerMobile) return 0;
        
        const customerSales = salesHistory.filter(s => s.customerMobile === activeCart.customerMobile);
        
        return customerSales.reduce((sum, sale) => sum + (sale.balance_due || 0), 0);

    }, [activeCart.customerMobile, salesHistory]);

    useEffect(() => {
        if (!isAmountPaidEdited[activeCartIndex]) {
            const grandTotal = total + previousBalanceDue;
            setPaidAmounts(prev => {
                const newAmounts = [...prev];
                newAmounts[activeCartIndex] = grandTotal > 0 ? grandTotal : 0;
                return newAmounts;
            });
        }
    }, [total, previousBalanceDue, isAmountPaidEdited, activeCartIndex]);
    
    const handleFinalizeSale = () => {
        if (!db || !activeShopId) return;
        if (activeCart.items.length === 0 && previousBalanceDue <= 0) {
            alert("Cannot finalize an empty sale with no outstanding balance.");
            return;
        }

        const saleId = `INV-${activeShopId}-${Date.now()}`;
        const grandTotal = total + previousBalanceDue;
        const roundedGrandTotal = Math.round(grandTotal);
        const finalPaidAmount = Math.min(paidAmount, roundedGrandTotal);
        const balanceDue = roundedGrandTotal - finalPaidAmount;

        db.exec("BEGIN TRANSACTION;");
        try {
            // 1. Insert into sales_history
            db.run(
                "INSERT INTO sales_history (id, shop_id, date, subtotal, discount, tax, total, paid_amount, balance_due, customerName, customerMobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [saleId, activeShopId, new Date().toISOString(), subtotal, activeCart.discount, activeCart.tax, total, finalPaidAmount, balanceDue, activeCart.customerName, activeCart.customerMobile]
            );

            // 2. Insert sale items
            const stmt = db.prepare("INSERT INTO sale_items (sale_id, productId, shop_id, description, descriptionTamil, quantity, price, isReturn, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            activeCart.items.forEach(item => {
                stmt.run([saleId, item.productId, activeShopId, item.description, item.descriptionTamil, item.quantity, item.price, item.isReturn ? 1 : 0, item.hsnCode]);
                // 3. Update product stock
                const stockChange = item.isReturn ? item.quantity : -item.quantity;
                db.run("UPDATE products SET stock = stock + ? WHERE id = ? AND shop_id = ?", [stockChange, item.productId, activeShopId]);
            });
            stmt.free();

            // 4. Update previous balances for the same customer
            if (activeCart.customerMobile) {
                db.run("UPDATE sales_history SET balance_due = 0 WHERE customerMobile = ? AND id != ?", [activeCart.customerMobile, saleId]);
            }
            
            // 5. Add to payment history
            if (finalPaidAmount > 0) {
                db.run("INSERT INTO payment_history (sale_id, date, amount_paid, payment_method) VALUES (?, ?, ?, ?)",
                    [saleId, new Date().toISOString(), finalPaidAmount, 'Cash'] // Defaulting to Cash
                );
            }
            
            db.exec("COMMIT;");
            
            // Success: reload data, show final invoice, and reset cart
            saveDbToIndexedDB().then(() => {
                loadShopData(activeShopId);
                const finalSaleRecord = {
                    ...activeCart,
                    id: saleId,
                    date: new Date().toISOString(),
                    total, subtotal,
                    paid_amount: finalPaidAmount,
                    balance_due: balanceDue,
                    isFinalized: true
                };
                setPreviewSale(finalSaleRecord);
                setIsInvoicePreviewOpen(true);
                setIsPreviewingNewSale(false); // It's a finalized sale now
                // Reset cart for next sale
                setCarts(prev => {
                    const newCarts = [...prev];
                    newCarts[activeCartIndex] = JSON.parse(JSON.stringify(defaultCartState));
                    return newCarts;
                });
                setPaidAmounts(prev => {
                    const newAmounts = [...prev];
                    newAmounts[activeCartIndex] = 0;
                    return newAmounts;
                });
                setIsAmountPaidEdited(prev => {
                    const newEdits = [...prev];
                    newEdits[activeCartIndex] = false;
                    return newEdits;
                });
            });

        } catch (e) {
            db.exec("ROLLBACK;");
            console.error("Transaction failed:", e);
            alert("An error occurred while finalizing the sale. The transaction has been rolled back.");
        }
    };
    
    const handlePreviewSale = () => {
        if (activeCart.items.length === 0 && previousBalanceDue <= 0) {
            alert("Add items or select a customer with a balance to create an invoice.");
            return;
        }
        
        const grandTotal = total + previousBalanceDue;
        const roundedGrandTotal = Math.round(grandTotal);
        const finalPaidAmount = Math.min(paidAmount, roundedGrandTotal);
        const balanceDue = roundedGrandTotal - finalPaidAmount;

        const saleForPreview = {
            ...activeCart,
            date: new Date().toISOString(),
            total: roundedGrandTotal, // Use the final rounded total for preview
            subtotal,
            paid_amount: finalPaidAmount,
            balance_due: balanceDue,
            previousBalanceForPreview: previousBalanceDue,
        };
        setPreviewSale(saleForPreview);
        setIsPreviewingNewSale(true); // This is a preview of a new, unfinalized sale
        setIsInvoicePreviewOpen(true);
    };

    const handlePrintHistoricalSale = (sale: SaleRecord) => {
        setPreviewSale(sale);
        setIsPreviewingNewSale(false); // This is a historical, finalized sale
        setIsInvoicePreviewOpen(true);
    };
    
    const handleSettlePayment = (saleId: string, amount: number) => {
        if (!db || !activeShopId) return;

        const saleToUpdate = salesHistory.find(s => s.id === saleId);
        if (!saleToUpdate) return;
        
        const newPaidAmount = saleToUpdate.paid_amount + amount;
        const newBalance = saleToUpdate.total - newPaidAmount;

        db.run(
            "UPDATE sales_history SET paid_amount = ?, balance_due = ? WHERE id = ?",
            [newPaidAmount, newBalance, saleId]
        );
        
        db.run(
            "INSERT INTO payment_history (sale_id, date, amount_paid, payment_method) VALUES (?, ?, ?, ?)",
            [saleId, new Date().toISOString(), amount, 'Cash']
        );

        saveDbToIndexedDB().then(() => loadShopData(activeShopId));
    };

    const handleShowHistory = () => {
        if(activeCart.customerMobile) {
            setHistoryMobile(activeCart.customerMobile);
            setIsHistoryModalOpen(true);
        } else {
            alert("Please enter a customer mobile number to view their history.");
        }
    };
    
    const handleAddNewProductFromSale = (description: string): Product | null => {
        if (!db || !activeShop) return null;
        
        const trimmedDesc = description.trim();
        if (!trimmedDesc) return null;

        const newProductId = activeShop.nextProductId;
        const newProduct: Omit<Product, 'id'> = {
            description: trimmedDesc,
            descriptionTamil: '',
            barcode: '',
            b2bPrice: 0,
            b2cPrice: 0,
            stock: 0,
            category: '',
            hsnCode: '',
        };

        try {
            db.run(
                "INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [newProductId, activeShopId, newProduct.description, newProduct.descriptionTamil, newProduct.barcode, newProduct.b2bPrice, newProduct.b2cPrice, newProduct.stock, newProduct.category, newProduct.hsnCode]
            );
            db.run("UPDATE shops SET nextProductId = ? WHERE id = ?", [newProductId + 1, activeShopId]);
            
            saveDbToIndexedDB().then(() => {
                loadShopData(activeShopId!);
                loadShops();
            });

            return { ...newProduct, id: newProductId };
        } catch (error) {
            console.error("Error creating new product from sale:", error);
            alert("Failed to create new product. Please try again from the inventory page.");
            return null;
        }
    };

    const handleUpdateProductPrice = (productId: number, newPrice: number, priceMode: 'b2b' | 'b2c') => {
        if (!db || !activeShopId) return;
        const fieldToUpdate = priceMode === 'b2b' ? 'b2bPrice' : 'b2cPrice';
        db.run(`UPDATE products SET ${fieldToUpdate} = ? WHERE id = ? AND shop_id = ?`, [newPrice, productId, activeShopId]);
        saveDbToIndexedDB().then(() => loadShopData(activeShopId));
    };

    const handleUpdateProductDetails = (productId: number, field: keyof Product, value: string) => {
        if (!db || !activeShopId || !['description', 'descriptionTamil'].includes(field)) return;
        db.run(`UPDATE products SET ${field} = ? WHERE id = ? AND shop_id = ?`, [value, productId, activeShopId]);
        saveDbToIndexedDB().then(() => loadShopData(activeShopId));
    };

    // --- BACKUP & RESTORE ---
    const handleSaveBackup = async () => {
        if (!db) return;
        const data = db.export();
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `pos_backup_${date}.sqlite`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (arrayBuffer) {
                const uInt8Array = new Uint8Array(arrayBuffer);
                setIsRestoreModalOpen(true);
                setRestoreProgress({ percentage: 0, eta: '...', message: 'Starting restore...' });

                setTimeout(() => {
                    setRestoreProgress({ percentage: 50, eta: 'few seconds', message: 'Restoring data...' });
                    try {
                        const newDb = new (window as any).SQL.Database(uInt8Array);
                        db.close();
                        db = newDb;
                        saveDbToIndexedDB().then(() => {
                            setRestoreProgress({ percentage: 100, eta: '0s', message: 'Restore Complete!' });
                            setTimeout(() => {
                                setIsRestoreModalOpen(false);
                                // Force a reload to re-initialize everything from the new DB
                                window.location.reload();
                            }, 1500);
                        });
                    } catch (err) {
                        console.error("Restore failed:", err);
                        alert("Failed to restore the database. The file might be corrupted.");
                        setIsRestoreModalOpen(false);
                    }
                }, 500);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; // Reset file input
    };

    // --- AI & PRO FEATURES ---
    const handleUpgrade = () => {
        if (userPlan === 'pro') return true;
        
        const isFreeLimitReached = aiUsageCount >= 3;
        
        if (isFreeLimitReached) {
             setConfirmation({
                message: "You've used all your free AI credits for this session. Upgrade to the Pro plan for unlimited AI features, multi-shop management, and advanced reporting.",
                onConfirm: () => {
                    // In a real app, this would redirect to a payment page
                    setUserPlan('pro');
                    localStorage.setItem('userPlan', 'pro');
                    setIsConfirmationModalOpen(false);
                    alert("You've been upgraded to the Pro plan!");
                }
            });
            setIsConfirmationModalOpen(true);
            return false;
        }
        return true;
    };

    const incrementAiUsage = () => {
        if (userPlan === 'free') {
            const newCount = aiUsageCount + 1;
            setAiUsageCount(newCount);
            localStorage.setItem('aiUsageCount', String(newCount));
        }
    };

    const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    const processImageForProducts = async (file: File) => {
        incrementAiUsage();
        setIsBulkAddLoading(true);
        setBulkAddError(null);
        setBulkAddProducts([]); // Clear previous results

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (event) => {
                const base64Image = (event.target?.result as string).split(',')[1];

                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: {
                        parts: [
                            { text: "Analyze this image of a product list. Extract the product description, B2C price, and stock quantity for each item. Respond ONLY with a JSON array matching the specified schema. If a value isn't present, use a sensible default (e.g., 0 for price/stock). Ensure description is a string, and b2cPrice and stock are numbers." },
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    b2cPrice: { type: Type.NUMBER },
                                    stock: { type: Type.NUMBER },
                                },
                            },
                        },
                    },
                });

                const extractedData = JSON.parse(response.text);
                const newProducts: EditableProduct[] = extractedData.map((item: any) => ({
                    description: item.description || '',
                    descriptionTamil: '',
                    barcode: '',
                    b2bPrice: item.b2cPrice || 0, // Default B2B to B2C if not present
                    b2cPrice: item.b2cPrice || 0,
                    stock: item.stock || 0,
                    category: '',
                    hsnCode: '',
                }));
                setBulkAddProducts(newProducts);
            };
            reader.onerror = () => {
                throw new Error("Could not read the image file.");
            };
        } catch (error: any) {
            console.error("Error processing image:", error);
            setBulkAddError(error.message || "Failed to analyze image with AI. Please check the image format and try again.");
        } finally {
            setIsBulkAddLoading(false);
        }
    };

    const processPdfsForProducts = async (b2bFile: File, b2cFile: File) => {
        incrementAiUsage();
        setIsBulkAddLoading(true);
        setBulkAddError(null);
        setBulkAddProducts([]);
        
        try {
            const fileToArrayBuffer = (file: File): Promise<Uint8Array> => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
                reader.onerror = err => reject(err);
                reader.readAsArrayBuffer(file);
            });

            const [b2bData, b2cData] = await Promise.all([
                fileToArrayBuffer(b2bFile),
                fileToArrayBuffer(b2cFile),
            ]);

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                I have two PDF price lists: one for B2B and one for B2C.
                Your task is to analyze both documents, extract the product information, and merge them into a single, unified product list.
                - The product description should be the primary key for merging.
                - Extract the description, B2B price from the first file, and B2C price from the second file.
                - Some products might exist in one list but not the other. Handle these cases gracefully.
                - Default stock to 0.
                Respond ONLY with a JSON array of objects.
            `;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'application/pdf', data: uint8ArrayToBase64(b2bData) } },
                        { inlineData: { mimeType: 'application/pdf', data: uint8ArrayToBase64(b2cData) } },
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                description: { type: Type.STRING },
                                b2bPrice: { type: Type.NUMBER },
                                b2cPrice: { type: Type.NUMBER },
                            },
                        },
                    },
                },
            });
            
            const extractedData = JSON.parse(response.text);
            const newProducts: EditableProduct[] = extractedData.map((item: any) => ({
                description: item.description || '',
                descriptionTamil: '',
                barcode: '',
                b2bPrice: item.b2bPrice || item.b2cPrice || 0,
                b2cPrice: item.b2cPrice || item.b2bPrice || 0,
                stock: 0,
                category: '',
                hsnCode: '',
            }));

            setBulkAddProducts(newProducts);

        } catch (error: any) {
            console.error("Error processing PDFs:", error);
            setBulkAddError(error.message || "Failed to analyze PDFs with AI. Please ensure the files are valid and try again.");
        } finally {
            setIsBulkAddLoading(false);
        }
    };
    
    const handleBulkAddFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsBulkAddModalOpen(true);
            const fileUrl = URL.createObjectURL(file);
            setBulkAddFileSrc(fileUrl);
            setBulkAddFileType('image');
            processImageForProducts(file);
        }
        e.target.value = ''; // Reset file input
    };
    
    const handleBulkAddFromPdfs = (b2bFile: File, b2cFile: File) => {
        setIsPdfUploadModalOpen(false);
        setIsBulkAddModalOpen(true);
        setBulkAddFileType('dual-pdf');
        setBulkAddPdfFileNames({ b2b: b2bFile.name, b2c: b2cFile.name });
        processPdfsForProducts(b2bFile, b2cFile);
    };

    const handleSaveBulkProducts = (productsToSave: EditableProduct[]) => {
        if (!db || !activeShop) {
            alert("Database or active shop not found.");
            return;
        }

        let nextId = activeShop.nextProductId;
        db.exec("BEGIN TRANSACTION;");
        try {
            const stmt = db.prepare("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            productsToSave.forEach(p => {
                stmt.run([nextId++, activeShopId, p.description, p.descriptionTamil, p.barcode, p.b2bPrice, p.b2cPrice, p.stock, p.category, p.hsnCode]);
            });
            stmt.free();
            db.run("UPDATE shops SET nextProductId = ? WHERE id = ?", [nextId, activeShopId]);
            db.exec("COMMIT;");
        } catch (err) {
            db.exec("ROLLBACK;");
            console.error("Bulk add transaction failed:", err);
            alert("An error occurred during bulk import. The transaction has been rolled back.");
            return;
        }

        saveDbToIndexedDB().then(() => {
            loadShopData(activeShopId!);
            loadShops();
            setIsBulkAddModalOpen(false);
            setBulkAddProducts([]);
        });
    };

    // --- PDF EXPORT ---
    const handleExportProductsPdf = (productsToExport: Product[]) => {
        if (productsToExport.length === 0) {
            alert("No products to export.");
            return;
        }

        const date = new Date().toLocaleDateString();
        const shopName = activeShop?.name || 'Inventory';

        const tableBody = productsToExport.map(p => `
            <tr>
                <td>${p.id}</td>
                <td>${p.description}</td>
                <td>${p.b2bPrice.toFixed(2)}</td>
                <td>${p.b2cPrice.toFixed(2)}</td>
                <td>${p.stock}</td>
                <td>${p.barcode || ''}</td>
            </tr>
        `).join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h1, h2 { text-align: center; }
                </style>
            </head>
            <body>
                <h1>Product Price List</h1>
                <h2>${shopName} - ${date}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Description</th>
                            <th>B2B Price</th>
                            <th>B2C Price</th>
                            <th>Stock</th>
                            <th>Barcode</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBody}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        html2pdf(htmlContent, {
            margin: 10,
            filename: `product_list_${shopName}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        });
    };
    
    // --- BILL SETTINGS MANAGEMENT ---
    const handleSaveBillSettings = (settings: BillSettings) => {
        if (!activeShopId) return;
        
        // Track if user explicitly edits shop name
        const hasShopNameBeenEdited = settings.shopName !== activeShop?.name;
        const settingsToSave = { ...settings, shopNameEdited: hasShopNameBeenEdited };

        setBillSettings(settingsToSave);
        localStorage.setItem(`billSettings_${activeShopId}`, JSON.stringify(settingsToSave));
        alert("Settings saved successfully!");
    };
    
    const handleBillSettingsPreview = () => {
        const dummySale = {
            id: 'PREVIEW-123',
            date: new Date().toISOString(),
            customerName: 'John Doe',
            customerMobile: '9876543210',
            items: [
                { id: 1, productId: 101, description: 'Sample Product A', quantity: 2, price: 150.00, isReturn: false },
                { id: 2, productId: 102, description: 'Another Item B', quantity: 1, price: 275.50, isReturn: false },
                { id: 3, productId: 103, description: 'Product with a much longer name to test wrapping', quantity: 3, price: 80.25, isReturn: false },
            ],
            subtotal: 816.25,
            discount: 16.25,
            tax: 5, // 5%
            total: 840.00,
            paid_amount: 850.00,
            balance_due: 0,
        };
        setPreviewSale(dummySale);
        setIsBillSettingsPreviewOpen(true);
    };

    // --- RENDER LOGIC ---
    if (!dbReady) {
        return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}><h2>Loading Database...</h2></div>;
    }

    if (!isLoggedIn) {
        return <LoginView onLoginSuccess={handleLoginSuccess} />;
    }
    
    if (isInitialSetup) {
        return <InitialSetupModal onCreate={handleCreateShop} />;
    }

    if (!activeShop) {
        return (
            <div style={styles.appContainer}>
                <div style={styles.header}>
                    <h1 style={styles.title}>Gem POS</h1>
                    <div>
                         <button onClick={() => setIsShopManagerOpen(true)} style={styles.shopManagerButton}>Manage Shops</button>
                         <button onClick={handleLogout} style={{...styles.logoutButton, marginLeft: '1rem'}}>Logout</button>
                    </div>
                </div>
                <div style={styles.mainContent}>
                     <div style={{textAlign: 'center', padding: '4rem 1rem'}}>
                         <h2>No Shop Selected</h2>
                         <p>Please create or select a shop to begin.</p>
                         <button onClick={() => setIsShopManagerOpen(true)} style={styles.button}>Open Shop Manager</button>
                    </div>
                </div>
                 {isShopManagerOpen && <ShopManagerModal shops={shops} activeShopId={activeShopId} onSelect={handleSelectShop} onCreate={handleCreateShop} onRename={renameShop} onDelete={handleDeleteShop} onClose={() => setIsShopManagerOpen(false)} userPlan={userPlan} onUpgrade={() => { handleUpgrade(); setIsShopManagerOpen(false); }} />}
            </div>
        );
    }
    
    const renderView = () => {
        switch (view) {
            case 'products':
                return <ProductsView 
                            products={products}
                            onAdd={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
                            onEdit={(p) => { setEditingProduct(p); setIsProductModalOpen(true); }}
                            onDelete={handleDeleteProduct}
                            onBulkAdd={handleBulkAddFromFile}
                            onBulkAddPdfs={() => setIsPdfUploadModalOpen(true)}
                            onExportPdf={handleExportProductsPdf}
                            selectedProductIds={selectedProductIds}
                            setSelectedProductIds={setSelectedProductIds}
                            onDeleteSelected={handleDeleteSelectedProducts}
                            isOnline={isOnline}
                            aiUsage={{ plan: userPlan, count: aiUsageCount }}
                            onUpgrade={handleUpgrade}
                            currentUser={currentUser}
                        />;
            case 'reports':
                return <ReportsView salesHistory={salesHistory} onPrint={handlePrintHistoricalSale} userPlan={userPlan} onUpgrade={handleUpgrade} isOnline={isOnline} />;
            case 'customers':
                return <CustomersView 
                            customers={customers} 
                            salesHistory={salesHistory} 
                            onAdd={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
                            onEdit={(c) => { setEditingCustomer(c); setIsCustomerModalOpen(true); }}
                            onDelete={handleDeleteCustomer}
                            currentUser={currentUser}
                        />;
            case 'expenses':
                return <ExpensesView expenses={expenses} onAdd={handleExpenseAdd} onDelete={handleExpenseDelete} shopId={activeShopId!} userPlan={userPlan} onUpgrade={handleUpgrade} />;
            case 'balance_due':
                return <BalanceDueView salesHistory={salesHistory} customers={customers} onSettlePayment={handleSettlePayment} />;
            case 'settings':
                return <SettingsView 
                            billSettings={billSettings} 
                            onSave={handleSaveBillSettings} 
                            onPreview={handleBillSettingsPreview} 
                            activeShopName={activeShop.name}
                            onRenameShop={handleRenameShopInSettings}
                            userPlan={userPlan}
                            onUpgrade={handleUpgrade}
                        />;
            case 'sales':
            default:
                return <SalesView 
                            products={products}
                            activeCart={activeCart}
                            updateActiveCart={updateActiveCart}
                            onPreview={handlePreviewSale}
                            total={total + previousBalanceDue}
                            paidAmount={paidAmount}
                            setPaidAmount={setPaidAmountForCart}
                            onAmountPaidEdit={handleAmountPaidEditForCart}
                            previousBalanceDue={previousBalanceDue}
                            onShowHistory={handleShowHistory}
                            onSaveBackup={handleSaveBackup}
                            onRestoreBackup={handleRestoreBackup}
                            onUpdateProductPrice={handleUpdateProductPrice}
                            onUpdateProductDetails={handleUpdateProductDetails}
                            onAddNewProduct={handleAddNewProductFromSale}
                            isOnline={isOnline}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            currentUser={currentUser}
                            activeCartIndex={activeCartIndex}
                            onCartChange={(index) => setActiveCartIndex(index)}
                        />;
        }
    };

    return (
        <div style={styles.appContainer}>
            <div style={styles.header}>
                 <h1 style={styles.title}>
                    <span style={{color: 'var(--secondary-color)', fontWeight: 400}}>{activeShop?.name || 'No Shop'} /</span> {view.charAt(0).toUpperCase() + view.slice(1)}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <DropdownNav activeView={view} onSelectView={setView} disabled={isProductModalOpen || isConfirmationModalOpen || isInvoicePreviewOpen || isBulkAddModalOpen} currentUser={currentUser} />
                    <button onClick={() => setIsShopManagerOpen(true)} style={styles.shopManagerButton}>Manage Shops</button>
                    <button onClick={handleLogout} style={styles.logoutButton}>Logout</button>
                </div>
            </div>
            <main style={styles.mainContent}>
                {renderView()}
            </main>
            
            {/* --- MODALS --- */}
            {isProductModalOpen && <ProductFormModal product={editingProduct} onSave={handleAddProduct} onUpdate={handleUpdateProduct} onClose={() => setIsProductModalOpen(false)} />}
            {isCustomerModalOpen && <CustomerFormModal customer={editingCustomer} onSave={editingCustomer ? handleUpdateCustomer : handleAddCustomer} onClose={() => setIsCustomerModalOpen(false)} />}
            {isConfirmationModalOpen && <ConfirmationModal message={confirmation.message} onConfirm={confirmation.onConfirm} onCancel={() => setIsConfirmationModalOpen(false)} />}
            {isHistoryModalOpen && <HistoryModal salesHistory={salesHistory} customerMobile={historyMobile} onClose={() => setIsHistoryModalOpen(false)} />}
            {isPdfUploadModalOpen && <PdfUploadModal onProcess={handleBulkAddFromPdfs} onClose={() => setIsPdfUploadModalOpen(false)} />}
            {isBulkAddModalOpen && <BulkAddModal 
                fileSrc={bulkAddFileSrc} 
                fileType={bulkAddFileType} 
                fileNames={bulkAddPdfFileNames}
                initialProducts={bulkAddProducts} 
                onSave={handleSaveBulkProducts} 
                onClose={() => setIsBulkAddModalOpen(false)} 
                loading={isBulkAddLoading}
                error={bulkAddError}
            />}
            {isInvoicePreviewOpen && isPreviewingNewSale && (
                <InvoicePreviewModal 
                    sale={previewSale} 
                    onFinalize={handleFinalizeSale}
                    onClose={() => setIsInvoicePreviewOpen(false)}
                    isPreviewMode={true}
                />
            )}
             {isInvoicePreviewOpen && !isPreviewingNewSale && (
                <InvoicePreviewModal 
                    sale={previewSale} 
                    onClose={() => setIsInvoicePreviewOpen(false)}
                />
            )}
             {isBillSettingsPreviewOpen && (
                <InvoicePreviewModal 
                    sale={previewSale}
                    onClose={() => setIsBillSettingsPreviewOpen(false)}
                    isPreviewMode={true}
                />
            )}
            {isShopManagerOpen && <ShopManagerModal shops={shops} activeShopId={activeShopId} onSelect={handleSelectShop} onCreate={handleCreateShop} onRename={renameShop} onDelete={handleDeleteShop} onClose={() => setIsShopManagerOpen(false)} userPlan={userPlan} onUpgrade={() => { handleUpgrade(); setIsShopManagerOpen(false); }} />}
            {isRestoreModalOpen && <RestoreProgressModal {...restoreProgress} />}

        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
