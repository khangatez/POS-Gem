import React, { useState, useEffect, useRef } from 'react';
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

interface Shop {
    id: number;
    name: string;
    products: Product[];
    salesHistory: SaleRecord[];
    nextProductId: number;
}

type UserPlan = 'free' | 'pro';

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

// --- SALE CONFIRMATION MODAL ---
const SaleConfirmationModal = ({ details, onConfirm, onCancel }: {
    details: {
        previousBalance: number;
        currentBill: number;
        grandTotal: number;
        amountPaid: number;
        newBalance: number;
    };
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const { previousBalance, currentBill, grandTotal, amountPaid, newBalance } = details;
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        confirmBtnRef.current?.focus();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm, onCancel]);

    return (
        <div style={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="sale-confirmation-title">
            <div style={{ ...styles.modalContent, maxWidth: '450px' }}>
                <h3 id="sale-confirmation-title" style={{ marginTop: 0, color: 'var(--primary-color)' }}>Confirm Transaction</h3>
                <div style={styles.confirmationDetails}>
                    <div style={styles.confirmationRow}>
                        <span>Previous Balance:</span>
                        <span>₹{previousBalance.toFixed(2)}</span>
                    </div>
                    <div style={styles.confirmationRow}>
                        <span>Current Bill Total:</span>
                        <span>₹{currentBill.toFixed(2)}</span>
                    </div>
                    <div style={{...styles.confirmationRow, fontWeight: 'bold', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem'}}>
                        <span>Grand Total Due:</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                    </div>
                     <div style={{...styles.confirmationRow, fontWeight: 'bold' }}>
                        <span>Amount Paid:</span>
                        <span>₹{amountPaid.toFixed(2)}</span>
                    </div>
                     <div style={{...styles.confirmationRow, fontWeight: 'bold', color: newBalance > 0 ? 'var(--danger-color)' : 'var(--success-color)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem'}}>
                        <span>New Balance Remaining:</span>
                        <span>₹{newBalance.toFixed(2)}</span>
                    </div>
                </div>
                <div style={styles.modalActions}>
                    <button onClick={onCancel} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                    <button ref={confirmBtnRef} onClick={onConfirm} style={styles.button}>OK</button>
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
        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9.5 11.5c0 .83-.67 1.5-1.5 1.5H7v2H5.5V9h2.5c.83 0 1.5.67 1.5 1.5v1zm3.5 1.5h-1v-2h-1.5v2h-1V9H13v4zm5.5-1.5h-1.5v-1h1.5v-1h-1.5v-1h1.5v-1h-3V9h3c.83 0 1.5.67 1.5 1.5v1.5c0 .83-.67 1.5-1.5 1.5z"/>
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
                                    {/* Fix: Corrected typo from c2c to b2c */}
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
const ProductsView = ({ products, onEdit, onDelete, onAdd, onBulkAdd, onBulkAddPdfs, selectedProductIds, setSelectedProductIds, onDeleteSelected, isOnline, aiUsage, onUpgrade, currentUser }) => {
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
                p.barcode.toLowerCase().includes(query)
            );
        });
        
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
};

// --- INVOICE PREVIEW MODAL ---
const InvoicePreviewModal = ({ 
    sale, 
    billSettings,
    customerName, 
    customerMobile, 
    onFinalize, 
    onClose, 
    onPrint, 
    onWhatsApp, 
    language, 
    previousBalanceDue, 
    amountPaidEdited,
    isPreviewMode = false,
}: {
    sale: any;
    billSettings: BillSettings;
    customerName?: string;
    customerMobile?: string;
    onFinalize?: () => void;
    onClose?: () => void;
    onPrint?: () => void;
    onWhatsApp?: (number: string) => void;
    language: 'english' | 'tamil';
    previousBalanceDue: number;
    amountPaidEdited?: boolean;
    isPreviewMode?: boolean;
}) => {
    const [phoneNumber, setPhoneNumber] = useState(customerMobile || '');
    const printAreaRef = useRef<HTMLDivElement>(null);

    const purchasedItems = sale.items.filter((item: SaleItem) => !item.isReturn);
    const returnedItems = sale.items.filter((item: SaleItem) => item.isReturn);
    
    const returnTotal = returnedItems.reduce((acc: number, item: SaleItem) => acc + item.quantity * item.price, 0);
    const roundedGrandTotal = Math.round(sale.total);
    const balanceDue = sale.balance_due;
    const saleDate = isPreviewMode ? new Date() : new Date(sale.date);

    // Show detailed payment info if amount was edited, a balance exists, or it's a historical/detailed invoice
    const showPaymentDetails = billSettings.format !== 'simple' && (amountPaidEdited || balanceDue > 0 || !onFinalize);

    const handleWhatsAppClick = () => {
        // ... (WhatsApp logic remains the same)
    };
    
    const handleSaveAsPdf = () => {
        if (printAreaRef.current) {
            const opt = {
                margin:       [0.2, 0.2],
                filename:     `invoice-${sale.id || 'preview'}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            html2pdf().from(printAreaRef.current).set(opt).save();
        }
    };
    
    const invoiceSizeClass = `invoice-size-${billSettings.size}`;
    const invoiceStyle = billSettings.size === 'custom' ? { width: billSettings.customWidth } : {};

    const renderHeader = () => (
        <div style={{textAlign: 'center', marginBottom: '0.5rem'}}>
            {billSettings.displayOptions.showLogo && billSettings.logo && <img src={billSettings.logo} alt="Shop Logo" style={{maxWidth: '150px', maxHeight: '80px', marginBottom: '0.5rem'}} />}
            <h2 style={{margin: '0'}}>{billSettings.displayOptions.showShopName && billSettings.shopNameEdited ? billSettings.shopName : 'Invoice'}</h2>
            {billSettings.displayOptions.showShopAddress && <p style={{margin: '0.2rem 0'}}>{billSettings.shopAddress}</p>}
            {billSettings.displayOptions.showGstin && billSettings.format === 'gst' && billSettings.gstin && <p style={{margin: '0.2rem 0'}}>GSTIN: {billSettings.gstin}</p>}
            <p style={{margin: '0.2rem 0'}}>Date: {saleDate.toLocaleString()}</p>
        </div>
    );
    
    const renderTable = (items: SaleItem[], title: string, isReturn = false) => (
        <>
            {title && <h4 style={{ margin: '0.8rem 0 0.4rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>{title}</h4>}
            <table style={{...styles.table, fontSize: 'inherit', width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                    <tr>
                        <th style={{...styles.th, textAlign: 'left', padding: '2px'}}>Item</th>
                        {billSettings.format === 'gst' && <th style={{...styles.th, textAlign: 'left', padding: '2px'}}>HSN</th>}
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Qty</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Price</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={item.id} style={isReturn ? {color: 'var(--danger-color)'} : {}}>
                            <td style={{...styles.td, padding: '2px', fontWeight: 'bold'}}>
                                {language === 'tamil' && item.descriptionTamil ? item.descriptionTamil : item.description}
                            </td>
                            {billSettings.format === 'gst' && <td style={{...styles.td, padding: '2px'}}>{item.hsnCode || ''}</td>}
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.quantity}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.price.toFixed(1)}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px', fontWeight: 'bold'}}>{(item.quantity * item.price).toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );

    return (
        <div className="invoice-preview-backdrop" style={styles.modalBackdrop}>
            <div className={`invoice-preview-content-wrapper ${isPreviewMode ? '' : 'printable-area'}`} style={{...styles.modalContent, ...invoiceStyle, maxWidth: 'none', maxHeight: '90vh', overflowY: 'auto'}}>
                <div ref={printAreaRef} id="invoice-to-print" className={invoiceSizeClass}>
                    {renderHeader()}
                    
                    {customerName && <p style={{margin: '0.2rem 0'}}><b>Customer:</b> {customerName}</p>}
                    {customerMobile && <p style={{margin: '0.2rem 0'}}><b>Mobile:</b> {customerMobile}</p>}

                    {purchasedItems.length > 0 && renderTable(purchasedItems, '')}
                    
                    {returnedItems.length > 0 && (
                        <>
                            {renderTable(returnedItems, 'Returned Items', true)}
                            <div style={{textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '4px', marginTop: '4px'}}>
                                <p style={{margin: '2px 0', color: 'var(--danger-color)'}}><b>Total Returns: </b><b>-₹{returnTotal.toFixed(1)}</b></p>
                            </div>
                        </>
                    )}

                    <hr style={{border: '1px dashed #ccc', margin: '0.5rem 0'}}/>

                    <div style={{textAlign: 'right'}}>
                        {billSettings.format !== 'simple' && (
                            <>
                                {sale.discount > 0 && <p style={{margin: '2px 0'}}><b>Discount: </b><b>-₹{sale.discount.toFixed(1)}</b></p>}
                                {sale.tax > 0 && <p style={{margin: '2px 0'}}><b>Tax: </b><b>₹{sale.tax.toFixed(1)}</b></p>}
                                {previousBalanceDue > 0 && <p style={{margin: '2px 0'}}><b>Previous Balance: </b><b>₹{previousBalanceDue.toFixed(2)}</b></p>}
                            </>
                        )}
                        <p style={{margin: '2px 0', fontSize: '1.2em'}}><b>Grand Total: </b><b>₹{roundedGrandTotal.toFixed(2)}</b></p>
                    </div>
                    
                    {showPaymentDetails && (
                         <>
                            <hr style={{border: '1px solid #ccc', margin: '0.5rem 0'}}/>
                            <div style={{textAlign: 'right'}}>
                                <p style={{margin: '2px 0'}}><b>Amount Paid: </b><b>₹{(sale.paid_amount).toFixed(2)}</b></p>
                                {balanceDue > 0 && <p style={{margin: '2px 0', color: 'var(--danger-color)', fontSize: '1.2em'}}><b>Balance Due: </b><b>₹{balanceDue.toFixed(2)}</b></p>}
                            </div>
                        </>
                    )}

                     <div style={{textAlign: 'center', marginTop: '1rem'}}>
                        {billSettings.displayOptions.showTagline && billSettings.tagline && <p style={{margin: '0.2rem 0', fontWeight: 'bold'}}>{billSettings.tagline}</p>}
                        {billSettings.displayOptions.showFooterNotes && billSettings.footerNotes && <p style={{margin: '0.2rem 0', fontSize: '0.9em'}}>{billSettings.footerNotes}</p>}
                    </div>
                </div>
                 <div className="invoice-actions no-print" style={{...styles.modalActions, marginTop: '1.5rem', flexWrap: 'wrap'}}>
                    {!isPreviewMode && onWhatsApp && (
                        <>
                            <input
                                type="tel"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="Customer Phone for WhatsApp"
                                style={{...styles.input, marginRight: '0.5rem', flex: 1, minWidth: '150px'}}
                            />
                            <button onClick={handleWhatsAppClick} style={{...styles.button, backgroundColor: '#25D366'}}>WhatsApp</button>
                        </>
                    )}
                    {onPrint && <button onClick={onPrint} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Print</button>}
                    <button onClick={handleSaveAsPdf} style={{...styles.button, backgroundColor: '#dc3545'}}>Save as PDF</button>
                    {!isPreviewMode && onFinalize && <button onClick={onFinalize} style={{...styles.button, backgroundColor: 'var(--success-color)'}}>Finalize Sale</button>}
                    {onClose && <button onClick={onClose} style={{...styles.button, backgroundColor: onFinalize ? 'var(--danger-color)' : 'var(--secondary-color)'}}>{onFinalize ? 'Back' : 'Close'}</button>}
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
                                                    Print
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
        <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2zM7 11h10v2H7v-2z"/>
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
    currentUser
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

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearchTerm(term);
        if (term) {
            setSearchResults(
                products.filter(p => 
                    p.description.toLowerCase().includes(term.toLowerCase()) || 
                    (p.descriptionTamil && p.descriptionTamil.toLowerCase().includes(term.toLowerCase())) ||
                    p.barcode.toLowerCase().includes(term.toLowerCase())
                )
            );
        } else {
            setSearchResults([]);
        }
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
        const hasResults = searchResults.length > 0;
        const canAddNew = searchTerm.trim() !== '' && !hasResults && currentUser?.role !== 'cashier';

        if (!hasResults && !canAddNew) return;

        const itemCount = hasResults ? searchResults.length : (canAddNew ? 1 : 0);
        if (itemCount === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev + 1) % itemCount);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev - 1 + itemCount) % itemCount);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex > -1) {
                if (hasResults) {
                    handleAddToSale(searchResults[highlightedIndex]);
                } else if (canAddNew) {
                    handleCreateAndAddProduct();
                }
            } else { // Default to the first (and possibly only) option
                 if (hasResults) {
                     handleAddToSale(searchResults[0]);
                 } else if (canAddNew) {
                     handleCreateAndAddProduct();
                 }
            }
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
             setSearchResults(
                products.filter(p => 
                    p.description.toLowerCase().includes(term.toLowerCase()) || 
                    (p.descriptionTamil && p.descriptionTamil.toLowerCase().includes(term.toLowerCase())) ||
                    p.barcode.toLowerCase().includes(term.toLowerCase())
                )
            );
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
                                <li onClick={handleCreateAndAddProduct} style={highlightedIndex === 0 ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem} onMouseEnter={() => setHighlightedIndex(0)} >
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
const ShopManagerModal = ({ shops, activeShopId, onSelect, onCreate, onClose, userPlan, onUpgrade }: {
    shops: Shop[],
    activeShopId: number | null,
    onSelect: (shopId: number) => void,
    onCreate: (shopName: string) => void,
    onClose: () => void,
    userPlan: UserPlan,
    onUpgrade: () => void,
}) => {
    const [newShopName, setNewShopName] = useState('');
    const newShopInputRef = useRef<HTMLInputElement>(null);
    const isCreateDisabled = userPlan === 'free' && shops.length >= 1;

    useEffect(() => {
        newShopInputRef.current?.focus();
    }, []);

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

    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '500px' }}>
                <h2 style={{ marginTop: 0 }}>Shop Manager</h2>
                <div style={{ marginBottom: '1.5rem', maxHeight: '30vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    {shops.map(shop => (
                        <div
                            key={shop.id}
                            onClick={() => onSelect(shop.id)}
                            style={shop.id === activeShopId ? {...styles.shopListItem, ...styles.shopListItemActive} : styles.shopListItem}
                            role="button"
                            tabIndex={0}
                        >
                            {shop.name}
                        </div>
                    ))}
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
        { key: 'products', label: 'Product Inventory', roles: ['super_admin', 'shop_admin'] },
        { key: 'balance_due', label: 'Balance Due', roles: ['super_admin', 'shop_admin'] },
        { key: 'customers', label: 'Customers', roles: ['super_admin', 'shop_admin'] },
        { key: 'reports', label: 'Reports', roles: ['super_admin', 'shop_admin'] },
        { key: 'users', label: 'Users', roles: ['super_admin', 'shop_admin'] },
        { key: 'settings', label: 'Settings', roles: ['super_admin', 'shop_admin'] },
    ];

    const navItems = allNavItems.filter(item => currentUser && item.roles.includes(currentUser.role));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef]);
    
    const activeLabel = navItems.find(item => item.key === activeView)?.label || 'Menu';

    return (
        <div ref={dropdownRef} style={styles.dropdownContainer}>
            <button onClick={() => setIsOpen(!isOpen)} style={styles.dropdownButton} disabled={disabled}>
                {activeLabel}
                <span style={{ marginLeft: 'auto', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
            </button>
            {isOpen && (
                <div style={styles.dropdownMenu}>
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => {
                                onSelectView(item.key);
                                setIsOpen(false);
                            }}
                            style={activeView === item.key ? {...styles.dropdownMenuItem, ...styles.dropdownMenuItemActive} : styles.dropdownMenuItem}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- BILL SETTINGS MODULE ---
const BillSettingsModule = ({ settings, onUpdate, onPreview }: {
    settings: BillSettings;
    onUpdate: (updatedSettings: Partial<BillSettings> | ((prev: BillSettings) => Partial<BillSettings>)) => void;
    onPreview: () => void;
}) => {
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                onUpdate({ logo: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDisplayOptionChange = (option: keyof BillSettings['displayOptions'], value: boolean) => {
        onUpdate(prev => ({
            displayOptions: {
                ...prev.displayOptions,
                [option]: value,
            }
        }));
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                <div>
                    <label style={styles.label}>Bill Paper Size</label>
                    <select
                        style={styles.input}
                        value={settings.size}
                        onChange={(e) => onUpdate({ size: e.target.value as BillSettings['size'] })}
                    >
                        <option value="3-inch">3-inch Thermal Roll</option>
                        <option value="4-inch">4-inch Thermal Roll</option>
                        <option value="A4">A4 Paper</option>
                        <option value="A5">A5 Paper</option>
                        <option value="custom">Custom Width</option>
                    </select>
                </div>
                 <div>
                    <label style={styles.label}>Bill Format</label>
                    <select
                        style={styles.input}
                        value={settings.format}
                        onChange={(e) => onUpdate({ format: e.target.value as BillSettings['format'] })}
                    >
                        <option value="simple">Simple (Items & Total)</option>
                        <option value="detailed">Detailed (With All Charges)</option>
                        <option value="gst">GST / Tax Compliant</option>
                    </select>
                </div>
            </div>
             {settings.size === 'custom' && (
                <div>
                    <label style={styles.label}>Custom Paper Width (e.g., 80mm, 4in)</label>
                    <input
                        style={styles.input}
                        value={settings.customWidth}
                        onChange={(e) => onUpdate({ customWidth: e.target.value })}
                    />
                </div>
            )}
            <hr style={{border: 'none', borderTop: '1px solid var(--border-color)', margin: '1rem 0'}} />
            
            <h4 style={{margin: '0 0 1rem 0'}}>Invoice Content</h4>
            <div style={styles.settingsGrid}>
                <div style={styles.checkboxControl}>
                    <input type="checkbox" id="showLogo" checked={settings.displayOptions.showLogo} onChange={e => handleDisplayOptionChange('showLogo', e.target.checked)} />
                    <label htmlFor="showLogo">Show Logo</label>
                </div>
                 <div style={styles.checkboxControl}>
                    <input type="checkbox" id="showShopName" checked={settings.displayOptions.showShopName} onChange={e => handleDisplayOptionChange('showShopName', e.target.checked)} />
                    <label htmlFor="showShopName">Show Shop Name</label>
                </div>
                 <div style={styles.checkboxControl}>
                    <input type="checkbox" id="showShopAddress" checked={settings.displayOptions.showShopAddress} onChange={e => handleDisplayOptionChange('showShopAddress', e.target.checked)} />
                    <label htmlFor="showShopAddress">Show Shop Address</label>
                </div>
                {settings.format === 'gst' && (
                    <div style={styles.checkboxControl}>
                        <input type="checkbox" id="showGstin" checked={settings.displayOptions.showGstin} onChange={e => handleDisplayOptionChange('showGstin', e.target.checked)} />
                        <label htmlFor="showGstin">Show GSTIN</label>
                    </div>
                )}
                 <div style={styles.checkboxControl}>
                    <input type="checkbox" id="showTagline" checked={settings.displayOptions.showTagline} onChange={e => handleDisplayOptionChange('showTagline', e.target.checked)} />
                    <label htmlFor="showTagline">Show Tagline</label>
                </div>
                 <div style={styles.checkboxControl}>
                    <input type="checkbox" id="showFooter" checked={settings.displayOptions.showFooterNotes} onChange={e => handleDisplayOptionChange('showFooterNotes', e.target.checked)} />
                    <label htmlFor="showFooter">Show Footer Notes</label>
                </div>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'center'}}>
                <div>
                     <label style={styles.label}>Shop Logo</label>
                     <input type="file" accept="image/*" onChange={handleLogoUpload} style={{...styles.input, padding: '0.5rem'}} />
                     {settings.logo && <img src={settings.logo} alt="logo preview" style={{maxWidth: '100px', marginTop: '0.5rem', border: '1px solid var(--border-color)', padding: '0.25rem', borderRadius: '4px'}}/>}
                </div>
                <div>
                    <label style={styles.label}>Shop Name</label>
                    <input style={styles.input} value={settings.shopName} onChange={(e) => onUpdate({ shopName: e.target.value })} />
                </div>
            </div>
             <div>
                <label style={styles.label}>Shop Address</label>
                <input style={styles.input} value={settings.shopAddress} onChange={(e) => onUpdate({ shopAddress: e.target.value })} />
            </div>
            {settings.format === 'gst' && (
                <div>
                    <label style={styles.label}>GSTIN</label>
                    <input style={styles.input} value={settings.gstin} onChange={(e) => onUpdate({ gstin: e.target.value })} />
                </div>
            )}
             <div>
                <label style={styles.label}>Bill Tagline (Optional)</label>
                <input style={styles.input} value={settings.tagline} onChange={(e) => onUpdate({ tagline: e.target.value })} />
            </div>
             <div>
                <label style={styles.label}>Footer Notes (Optional)</label>
                <input style={styles.input} value={settings.footerNotes} onChange={(e) => onUpdate({ footerNotes: e.target.value })} />
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1rem'}}>
                <button onClick={onPreview} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                    Preview Invoice
                </button>
            </div>
        </div>
    );
};


// --- SETTINGS VIEW ---
const SettingsView = ({ userPlan, onRequestUpgrade, onDowngrade, isCloudSyncEnabled, onToggleCloudSync, onManageUsers, billSettings, onUpdateBillSettings, onPreviewBill }) => {
    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Settings & Subscription</h2>
            </div>
            <div style={{ maxWidth: '800px' }}>
                <div style={styles.settingsCard}>
                    <h3>Bill & Invoice Settings</h3>
                    <BillSettingsModule settings={billSettings} onUpdate={onUpdateBillSettings} onPreview={onPreviewBill} />
                </div>
            
                <div style={styles.settingsCard}>
                    <h3>Subscription Plan</h3>
                    {userPlan === 'free' ? (
                        <>
                            <p>You are currently on the <strong style={{color: 'var(--primary-color)'}}>Free Plan</strong>.</p>
                            <p style={{color: 'var(--secondary-color)'}}>Upgrade to Pro to unlock powerful features like multi-shop management, AI sales forecasting, and advanced reporting.</p>
                            <button onClick={onRequestUpgrade} style={{...styles.button, backgroundColor: 'var(--success-color)'}}>Upgrade to Pro</button>
                        </>
                    ) : (
                        <>
                            <p>You are on the <strong style={{color: 'var(--success-color)'}}>Pro Plan</strong>. Thank you for your support!</p>
                             <p style={{color: 'var(--secondary-color)'}}>You have access to all premium features.</p>
                            <button onClick={onDowngrade} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Switch to Free Plan</button>
                        </>
                    )}
                </div>

                <div style={styles.settingsCard}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <h3>Automated Cloud Sync</h3>
                        <span style={{...styles.proBadge, position: 'static'}}>PRO</span>
                    </div>
                     {isCloudSyncEnabled && userPlan === 'pro' ? (
                         <p style={{color: 'var(--secondary-color)'}}>Your data is being automatically backed up. Changes are saved periodically.</p>
                    ) : (
                         <p style={{color: 'var(--secondary-color)'}}>Enable this feature to automatically back up your data and sync across devices.</p>
                    )}
                    <button 
                        onClick={userPlan === 'free' ? onRequestUpgrade : onToggleCloudSync} 
                        style={{...styles.button, backgroundColor: isCloudSyncEnabled && userPlan === 'pro' ? 'var(--secondary-color)' : 'var(--success-color)'}}
                    >
                        {isCloudSyncEnabled && userPlan === 'pro' ? 'Disable Cloud Sync' : 'Enable Cloud Sync'}
                    </button>
                </div>
                 <div style={styles.settingsCard}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <h3>User Roles & Permissions</h3>
                         <span style={{...styles.proBadge, position: 'static'}}>PRO</span>
                    </div>
                    <p style={{color: 'var(--secondary-color)'}}>Create and manage accounts for your staff with specific roles like 'Shop Admin' or 'Cashier'.</p>
                    <button onClick={userPlan === 'free' ? onRequestUpgrade : onManageUsers} style={styles.button}>
                        Manage Users
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- GO PRO MODAL ---
const GoProModal = ({ onClose, onUpgrade }) => (
    <div style={styles.modalBackdrop}>
        <div style={{ ...styles.modalContent, maxWidth: '550px', textAlign: 'center' }}>
            <h2 style={{color: 'var(--primary-color)', marginTop: 0}}>Upgrade to Pro</h2>
            <p style={{color: 'var(--secondary-color)', fontSize: '1.1rem'}}>Unlock exclusive features to supercharge your business!</p>
            <ul style={{textAlign: 'left', listStyle: 'none', padding: 0, margin: '2rem 0'}}>
                <li style={styles.featureListItem}>✅ Manage unlimited shops from one account.</li>
                <li style={styles.featureListItem}>🤖 Access AI-powered Sales Forecasting & insights.</li>
                <li style={styles.featureListItem}>📈 Use advanced reporting with custom date ranges.</li>
                <li style={styles.featureListItem}>♾️ Enjoy unlimited AI bulk product uploads.</li>
                <li style={styles.featureListItem}>☁️ Automated cloud backup & sync.</li>
            </ul>
            <div style={{...styles.modalActions, justifyContent: 'center'}}>
                <button onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Maybe Later</button>
                <button onClick={onUpgrade} style={{...styles.button, backgroundColor: 'var(--success-color)', transform: 'scale(1.1)'}}>Upgrade Now</button>
            </div>
        </div>
    </div>
);

// --- USER MANAGEMENT VIEW & MODAL ---
const UserFormModal = ({ user, onSave, onClose, currentUser, shops }: { user: User | null, onSave: (userData: any) => Promise<void>, onClose: () => void, currentUser: User, shops: Shop[] }) => {
    const [username, setUsername] = useState(user?.username || '');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>(user?.role || (currentUser.role === 'super_admin' ? 'shop_admin' : 'cashier'));
    const [shopId, setShopId] = useState<string>(String(user?.shop_id || ''));
    
    const isSuperAdmin = currentUser.role === 'super_admin';
    const isEditing = !!user;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const userData: any = { username, role };
        if (password) userData.password = password;
        if (isSuperAdmin && role === 'shop_admin') userData.shop_id = parseInt(shopId, 10);
        if (isEditing) userData.id = user.id;

        onSave(userData);
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2>{isEditing ? 'Edit User' : 'Add New User'}</h2>
                <form onSubmit={handleSubmit} style={styles.productForm}>
                    <label style={styles.label}>Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={styles.input} required />

                    <label style={styles.label}>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} placeholder={isEditing ? 'Leave blank to keep current' : ''} required={!isEditing} />

                    <label style={styles.label}>Role</label>
                    <select value={role} onChange={e => setRole(e.target.value as UserRole)} style={styles.input}>
                        {isSuperAdmin && <option value="shop_admin">Shop Admin</option>}
                        <option value="cashier">Cashier</option>
                    </select>

                    {isSuperAdmin && role === 'shop_admin' && (
                        <>
                            <label style={styles.label}>Assign to Shop</label>
                            <select value={shopId} onChange={e => setShopId(e.target.value)} style={styles.input} required>
                                <option value="" disabled>Select a shop</option>
                                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </>
                    )}

                    <div style={styles.modalActions}>
                        <button type="button" onClick={onClose} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                        <button type="submit" style={styles.button}>Save User</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const UsersView = ({ currentUser, users, shops, onUserAdd, onUserUpdate, onUserDelete }) => {
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    const handleOpenModal = (user: User | null = null) => {
        setEditingUser(user);
        setIsUserModalOpen(true);
    };

    const handleSave = async (userData: any) => {
        if (userData.id) {
            await onUserUpdate(userData);
        } else {
            await onUserAdd(userData);
        }
        setIsUserModalOpen(false);
        setEditingUser(null);
    };
    
    const getShopName = (shopId: number | null) => {
        if (shopId === null) return 'N/A';
        return shops.find(s => s.id === shopId)?.name || 'Unknown Shop';
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>User Management</h2>
                <button onClick={() => handleOpenModal()} style={styles.button}>Add New User</button>
            </div>

             <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Username</th>
                        <th style={styles.th}>Role</th>
                        <th style={styles.th}>Shop</th>
                        <th style={styles.th}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td style={styles.td}>{user.username}</td>
                            <td style={styles.td}>{user.role.replace('_', ' ')}</td>
                            <td style={styles.td}>{getShopName(user.shop_id)}</td>
                            <td style={styles.td}>
                                <button onClick={() => handleOpenModal(user)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Edit</button>
                                <button onClick={() => setUserToDelete(user)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}} disabled={user.id === currentUser.id}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            {isUserModalOpen && (
                <UserFormModal
                    user={editingUser}
                    onSave={handleSave}
                    onClose={() => setIsUserModalOpen(false)}
                    currentUser={currentUser}
                    shops={shops}
                />
            )}
            {userToDelete && (
                 <ConfirmationModal
                    message={`Are you sure you want to delete the user "${userToDelete.username}"? This action cannot be undone.`}
                    onConfirm={() => { onUserDelete(userToDelete.id); setUserToDelete(null); }}
                    onCancel={() => setUserToDelete(null)}
                />
            )}

        </div>
    );
};


// --- PAYMENT MODAL ---
const PaymentModal = ({ sale, onClose, onAddPayment }: { sale: SaleRecord, onClose: () => void, onAddPayment: (saleId: string, amount: number, method: string) => void }) => {
    const [amount, setAmount] = useState<string>(sale.balance_due.toFixed(2));
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const amountInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paidAmount = parseFloat(amount);
        if (!isNaN(paidAmount) && paidAmount > 0) {
            if (paidAmount > sale.balance_due) {
                alert(`Payment cannot be greater than the balance due of ₹${sale.balance_due.toFixed(2)}`);
                return;
            }
            onAddPayment(sale.id, paidAmount, paymentMethod);
        }
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={{ ...styles.modalContent, maxWidth: '450px' }}>
                <h2 style={{ marginTop: 0 }}>Add Payment</h2>
                <p><strong>Customer:</strong> {sale.customerName || 'N/A'}</p>
                <p><strong>Total Bill:</strong> ₹{sale.total.toFixed(2)}</p>
                <p style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}><strong>Balance Due:</strong> ₹{sale.balance_due.toFixed(2)}</p>
                <form onSubmit={handleSubmit} style={styles.productForm}>
                    <label style={styles.label}>Payment Amount</label>
                    <input
                        ref={amountInputRef}
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={sale.balance_due.toFixed(2)}
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        style={styles.input}
                        required
                    />
                    <label style={styles.label}>Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={styles.input}>
                        <option>Cash</option>
                        <option>Card</option>
                        <option>UPI</option>
                        <option>Other</option>
                    </select>
                    <div style={styles.modalActions}>
                        <button type="button" onClick={onClose} style={{ ...styles.button, backgroundColor: 'var(--secondary-color)' }}>Cancel</button>
                        <button type="submit" style={styles.button}>Save Payment</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- BALANCE DUE VIEW ---
const BalanceDueView = ({ salesHistory, onAddPayment, onPrint }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [saleToPay, setSaleToPay] = useState<SaleRecord | null>(null);

    const outstandingSales = salesHistory
        .filter(s => s.balance_due > 0)
        .filter(s => 
            (s.customerName && s.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (s.customerMobile && s.customerMobile.includes(searchQuery))
        );

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Outstanding Balances</h2>
                <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <SearchIcon color="var(--secondary-color)" />
                    </span>
                    <input
                        type="search"
                        placeholder="Search by customer..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...styles.input, width: '300px', paddingLeft: '40px' }}
                        aria-label="Search outstanding balances"
                    />
                </div>
            </div>
            {outstandingSales.length > 0 ? (
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Date</th>
                            <th style={styles.th}>Customer</th>
                            <th style={styles.th}>Total</th>
                            <th style={styles.th}>Paid</th>
                            <th style={{...styles.th, color: 'var(--danger-color)'}}>Balance Due</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {outstandingSales.map(sale => (
                            <tr key={sale.id}>
                                <td style={styles.td}>{new Date(sale.date).toLocaleDateString()}</td>
                                <td style={styles.td}>{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td>
                                <td style={styles.td}>₹{sale.total.toFixed(2)}</td>
                                <td style={styles.td}>₹{sale.paid_amount.toFixed(2)}</td>
                                <td style={{...styles.td, color: 'var(--danger-color)', fontWeight: 'bold'}}>₹{sale.balance_due.toFixed(2)}</td>
                                <td style={styles.td}>
                                    <button onClick={() => setSaleToPay(sale)} style={{...styles.actionButton, backgroundColor: 'var(--success-color)'}}>Add Payment</button>
                                    <button onClick={() => onPrint(sale)} style={{...styles.actionButton, backgroundColor: 'var(--secondary-color)'}}>Print</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={styles.emptyMessage}>No outstanding balances found.</p>
            )}
            {saleToPay && <PaymentModal sale={saleToPay} onClose={() => setSaleToPay(null)} onAddPayment={onAddPayment} />}
        </div>
    );
};

// --- SESSION DROPDOWN COMPONENT ---
const SessionDropdown = ({ currentUser, activeShop, syncStatus, isCloudSyncEnabled, userPlan, onShopManagerClick, onLogout }: {
    currentUser: User;
    activeShop: Shop | null;
    syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
    isCloudSyncEnabled: boolean;
    userPlan: UserPlan;
    onShopManagerClick: () => void;
    onLogout: () => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const getSyncStatusStyle = (status: typeof syncStatus) => {
        switch (status) {
            case 'syncing': return { color: '#007bff' };
            case 'synced': return { color: 'var(--success-color)' };
            case 'error': return { color: 'var(--danger-color)' };
            default: return { color: 'var(--secondary-color)' };
        }
    };

    const getSyncStatusText = (status: typeof syncStatus) => {
        switch (status) {
            case 'syncing': return 'Syncing...';
            case 'synced': return 'Data Synced';
            case 'error': return 'Sync Error';
            default: return 'Sync Enabled';
        }
    };
    
    return (
        <div ref={dropdownRef} style={styles.sessionDropdownContainer}>
            <button onClick={() => setIsOpen(!isOpen)} style={styles.sessionDropdownButton}>
                <UserIcon size={20} />
                <span style={{ marginLeft: '0.5rem', fontWeight: 500 }}>{currentUser.username}</span>
                <span style={{ marginLeft: 'auto', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
            </button>
            {isOpen && (
                <div style={styles.sessionDropdownMenu}>
                    <div style={styles.sessionDropdownHeader}>
                        <strong style={{display: 'block'}}>{currentUser.username}</strong>
                        <span style={{fontSize: '0.9rem', color: 'var(--secondary-color)'}}>{currentUser.role.replace('_', ' ')}</span>
                    </div>
                    <div style={styles.sessionDropdownInfoItem}>
                        <strong>Shop:</strong>
                        <span>{activeShop?.name || 'N/A'}</span>
                    </div>
                    {userPlan === 'pro' && (
                        <div style={{...styles.sessionDropdownInfoItem, ...(isCloudSyncEnabled ? getSyncStatusStyle(syncStatus) : { color: 'var(--secondary-color)' })}}>
                             <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                <CloudIcon size={18} />
                                <strong>Sync Status:</strong>
                            </div>
                            <span>{isCloudSyncEnabled ? getSyncStatusText(syncStatus) : 'Disabled'}</span>
                        </div>
                    )}
                    <hr style={styles.sessionDropdownSeparator} />
                    {currentUser.role === 'super_admin' && (
                        <button onClick={() => { onShopManagerClick(); setIsOpen(false); }} style={styles.sessionDropdownMenuItem}>
                            Shop Manager
                        </button>
                    )}
                    <button onClick={() => { onLogout(); setIsOpen(false); }} style={{...styles.sessionDropdownMenuItem, color: 'var(--danger-color)'}}>
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App = () => {
    const [dbLoading, setDbLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [activeView, setActiveView] = useState('sales');
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
    
    // Multi-Shop State
    const [shops, setShops] = useState<Shop[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [activeShopId, setActiveShopId] = useState<number | null>(null);
    const [isShopManagerOpen, setIsShopManagerOpen] = useState(false);
    const [isInitialSetup, setIsInitialSetup] = useState(false);

    // Monetization State
    const [userPlan, setUserPlan] = useState<UserPlan>('free');
    const [isGoProModalOpen, setIsGoProModalOpen] = useState(false);
    const [aiUsage, setAiUsage] = useState<{ count: number, lastReset: string }>({ count: 0, lastReset: new Date().toISOString().slice(0, 10) });
    const AI_FREE_LIMIT = 3;
    const [isCloudSyncEnabled, setIsCloudSyncEnabled] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
    const syncIntervalRef = useRef<number | null>(null);

    // Bill Settings State
    const [billSettings, setBillSettings] = useState<BillSettings>(defaultBillSettings);
    const [isBillSettingsPreviewOpen, setIsBillSettingsPreviewOpen] = useState(false);


    // Derived state for the active shop
    const activeShop = shops.find(s => s.id === activeShopId) || null;
    
    // Customer Management State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

    // Multi-bill state
    const [carts, setCarts] = useState<CartState[]>([
        {...defaultCartState},
        {...defaultCartState},
        {...defaultCartState},
    ]);
    const [activeCartIndex, setActiveCartIndex] = useState(0);
    const [paidAmounts, setPaidAmounts] = useState<number[]>([0, 0, 0]);
    const [amountPaidEditedFlags, setAmountPaidEditedFlags] = useState<boolean[]>([false, false, false]);
    const [previousBalancesDue, setPreviousBalancesDue] = useState<number[]>([0, 0, 0]);

    const activeCart = carts[activeCartIndex] || defaultCartState;
    const paidAmount = paidAmounts[activeCartIndex] || 0;
    const amountPaidEdited = amountPaidEditedFlags[activeCartIndex];
    const previousBalanceDue = previousBalancesDue[activeCartIndex] || 0;

    const updateActiveCart = (updatedData: Partial<CartState>) => {
        setCarts(prevCarts => {
            const newCarts = [...prevCarts];
            const currentCart = newCarts[activeCartIndex] || defaultCartState;
            newCarts[activeCartIndex] = { ...currentCart, ...updatedData };
            return newCarts;
        });
    };
    
    const setPaidAmount = (amount: number) => {
        setPaidAmounts(prev => {
            const newAmounts = [...prev];
            newAmounts[activeCartIndex] = amount;
            return newAmounts;
        });
    };
    
    const handleAmountPaidEdit = () => {
        setAmountPaidEditedFlags(prev => {
            const newFlags = [...prev];
            newFlags[activeCartIndex] = true;
            return newFlags;
        });
    };

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isSaleConfirmModalOpen, setIsSaleConfirmModalOpen] = useState(false);
    const [saleToPrint, setSaleToPrint] = useState<SaleRecord | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    // State for Bulk Add Modals
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [isPdfUploadModalOpen, setIsPdfUploadModalOpen] = useState(false);
    const [bulkAddFileSrc, setBulkAddFileSrc] = useState<string | null>(null);
    const [bulkAddFileType, setBulkAddFileType] = useState<'image' | 'pdf' | 'dual-pdf' | null>(null);
    const [bulkAddFileNames, setBulkAddFileNames] = useState<{b2b: string, b2c: string} | null>(null);
    const [bulkAddProducts, setBulkAddProducts] = useState<EditableProduct[]>([]);
    const [isBulkAddLoading, setIsBulkAddLoading] = useState(false);
    const [bulkAddError, setBulkAddError] = useState<string | null>(null);
    
    // State for multi-select delete
    const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [productIdsToDelete, setProductIdsToDelete] = useState<number[]>([]);
    
    // State for Online/Offline status
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    // State for Restore Backup Progress
    const [restoreProgress, setRestoreProgress] = useState({ visible: false, percentage: 0, eta: '...', message: '' });
    
    // --- Monetization Logic ---
    const handleUpgrade = () => {
        setUserPlan('pro');
        setIsGoProModalOpen(false);
        // Persist choice for simulation
        localStorage.setItem('userPlan', 'pro');
    };
    
    const handleDowngrade = () => {
        setUserPlan('free');
        localStorage.setItem('userPlan', 'free');
    };

    const handleUpgradeRequest = () => {
        setIsGoProModalOpen(true);
    };
    
    const checkAndIncrementAiUsage = () => {
        const today = new Date().toISOString().slice(0, 10);
        let currentUsage = aiUsage;

        // Reset daily counter
        if (aiUsage.lastReset !== today) {
            currentUsage = { count: 0, lastReset: today };
        }
        
        if (userPlan === 'free' && currentUsage.count >= AI_FREE_LIMIT) {
            handleUpgradeRequest();
            return false;
        }
        
        const newUsage = { ...currentUsage, count: currentUsage.count + 1 };
        setAiUsage(newUsage);
        localStorage.setItem('aiUsage', JSON.stringify(newUsage));
        return true;
    };
    
    // --- Load settings from localStorage on initial render ---
    useEffect(() => {
        const savedPlan = localStorage.getItem('userPlan') as UserPlan;
        if (savedPlan) setUserPlan(savedPlan);

        const savedUsage = localStorage.getItem('aiUsage');
        if (savedUsage) { /* ... */ }
        
        const savedSync = localStorage.getItem('cloudSyncEnabled');
        if (savedSync === 'true') setIsCloudSyncEnabled(true);
        
        const savedBillSettings = localStorage.getItem('billSettings');
        if (savedBillSettings) {
            try {
                // Merge saved settings with defaults to ensure new properties are not missing
                const parsedSettings = JSON.parse(savedBillSettings);
                setBillSettings(prev => ({ ...prev, ...parsedSettings }));
            } catch (e) {
                console.error("Failed to parse bill settings from localStorage", e);
            }
        }
    }, []);
    
    const handleUpdateBillSettings = (updatedSettings: Partial<BillSettings> | ((prev: BillSettings) => Partial<BillSettings>)) => {
        setBillSettings(prev => {
            const newPartialSettings = typeof updatedSettings === 'function' ? updatedSettings(prev) : updatedSettings;
            const newSettings = { ...prev, ...newPartialSettings };
            
            // If displayOptions is being updated, merge it deeply
            if (newPartialSettings.displayOptions) {
                newSettings.displayOptions = { ...prev.displayOptions, ...newPartialSettings.displayOptions };
            }
    
            // If shopName is being updated, check if it's different from default
            if (newPartialSettings.shopName !== undefined && newPartialSettings.shopName !== defaultBillSettings.shopName && !prev.shopNameEdited) {
                newSettings.shopNameEdited = true;
            }
            
            localStorage.setItem('billSettings', JSON.stringify(newSettings));
            return newSettings;
        });
    };


    const toggleCloudSync = () => {
        const newState = !isCloudSyncEnabled;
        setIsCloudSyncEnabled(newState);
        localStorage.setItem('cloudSyncEnabled', String(newState));
        if (!newState) {
            setSyncStatus('idle'); // Reset status when disabled
        }
    };

    useEffect(() => {
        const performSync = async () => {
            if (!db) return;
            setSyncStatus('syncing');
            try {
                await saveDbToIndexedDB();
                await new Promise(resolve => setTimeout(resolve, 500));
                setSyncStatus('synced');
            } catch (err) {
                console.error("Cloud sync failed:", err);
                setSyncStatus('error');
            }
        };

        if (isCloudSyncEnabled && currentUser && userPlan === 'pro') {
            performSync();
            syncIntervalRef.current = window.setInterval(performSync, 30000); // Sync every 30 seconds
        }

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
                syncIntervalRef.current = null;
            }
        };
    }, [isCloudSyncEnabled, currentUser, userPlan, db]);


    // --- DB & AUTH ---
    useEffect(() => {
        const init = async () => {
            await initDb();
            const loggedInUserJson = sessionStorage.getItem('loggedInUser');
            if (loggedInUserJson) {
                const user: User = JSON.parse(loggedInUserJson);
                // Re-verify user from DB in case of tampering
                const userFromDb = sqlResultToObjects(db.exec("SELECT * FROM users WHERE id = ?", [user.id]));
                if (userFromDb.length > 0) {
                    setCurrentUser(userFromDb[0]);
                } else {
                    sessionStorage.removeItem('loggedInUser'); // Clear invalid session
                }
            }
            setDbLoading(false);
        };
        init();
        
        const setOnline = () => setIsOnline(true);
        const setOffline = () => setIsOnline(false);

        window.addEventListener('online', setOnline);
        window.addEventListener('offline', setOffline);

        return () => {
            window.removeEventListener('online', setOnline);
            window.removeEventListener('offline', setOffline);
        };
    }, []);


    const handleLoginSuccess = (user: User) => {
        sessionStorage.setItem('loggedInUser', JSON.stringify(user));
        setCurrentUser(user);
        if (user.role === 'cashier') setActiveView('sales');
    };

    const handleLogout = () => {
        sessionStorage.removeItem('loggedInUser');
        setCurrentUser(null);
        setShops([]);
        setUsers([]);
        setActiveShopId(null);
        setCarts([defaultCartState, defaultCartState, defaultCartState]);
        setActiveCartIndex(0);
    };

    const extractAndParseJson = (rawText: string | undefined): any => {
        if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
            throw new Error("Received an empty or invalid text response from the AI model.");
        }
    
        let textToParse = rawText.trim();
        
        // 1. Try to find a markdown-fenced JSON block
        const markdownMatch = textToParse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        
        if (markdownMatch && markdownMatch[1]) {
            textToParse = markdownMatch[1].trim();
        } else {
            // 2. If no markdown, find the first '{' or '[' and last '}' or ']'
            const firstBracket = textToParse.indexOf('{');
            const firstSquare = textToParse.indexOf('[');
            
            let startIndex = -1;
            // Determine the true start of the JSON data
            if (firstBracket === -1) {
                startIndex = firstSquare;
            } else if (firstSquare === -1) {
                startIndex = firstBracket;
            } else {
                startIndex = Math.min(firstBracket, firstSquare);
            }

            if (startIndex > -1) {
                const lastBracket = textToParse.lastIndexOf('}');
                const lastSquare = textToParse.lastIndexOf(']');
                const endIndex = Math.max(lastBracket, lastSquare);
                
                if (endIndex > startIndex) {
                    textToParse = textToParse.substring(startIndex, endIndex + 1);
                }
            }
        }
        
        // 3. Attempt to fix common LLM JSON error: missing commas between objects in an array.
        // This handles cases like `[ { ... } { ... } ]` which would otherwise fail to parse.
        const repairedText = textToParse.replace(/}\s*{/g, '},{');
        
        // 4. Now, try to parse the repaired text.
        try {
            return JSON.parse(repairedText);
        } catch (error: any) {
            console.error("Failed to parse cleaned JSON:", { error, originalText: rawText, repairedText });
            throw new Error(`The AI returned a response that could not be understood as valid JSON. Details: ${error.message}`);
        }
    };

    const ACTIVE_SHOP_KEY = 'pos-active-shop-id';

    
    // Load data from DB based on current user
    useEffect(() => {
        if (!currentUser || !db) {
            return;
        }

        const loadDataForUser = async () => {
            let shopsFromDb = [];
            let usersFromDb = [];

            if (currentUser.role === 'super_admin') {
                shopsFromDb = sqlResultToObjects(db.exec("SELECT * FROM shops"));
                usersFromDb = sqlResultToObjects(db.exec("SELECT id, username, role, shop_id FROM users"));
                const storedActiveId = localStorage.getItem(ACTIVE_SHOP_KEY);
                const activeId = storedActiveId ? parseInt(storedActiveId, 10) : (shopsFromDb.length > 0 ? shopsFromDb[0].id : null);
                setActiveShopId(activeId);

            } else if (currentUser.role === 'shop_admin') {
                shopsFromDb = sqlResultToObjects(db.exec("SELECT * FROM shops WHERE id = ?", [currentUser.shop_id]));
                usersFromDb = sqlResultToObjects(db.exec("SELECT id, username, role, shop_id FROM users WHERE shop_id = ?", [currentUser.shop_id]));
                setActiveShopId(currentUser.shop_id);

            } else if (currentUser.role === 'cashier') {
                shopsFromDb = sqlResultToObjects(db.exec("SELECT * FROM shops WHERE id = ?", [currentUser.shop_id]));
                // Cashiers don't need to see the user list
                usersFromDb = [];
                setActiveShopId(currentUser.shop_id);
            }

            if (shopsFromDb.length > 0) {
                 const fullShopsDataPromises = shopsFromDb.map(async (shop: any) => {
                    const products = sqlResultToObjects(db.exec("SELECT * FROM products WHERE shop_id = ?", [shop.id]));
                    const salesHistoryRaw = sqlResultToObjects(db.exec("SELECT * FROM sales_history WHERE shop_id = ? ORDER BY date DESC", [shop.id]));
                    const salesHistoryPromises = salesHistoryRaw.map(async (sale) => {
                         const items = sqlResultToObjects(db.exec("SELECT *, CASE WHEN isReturn = 1 THEN 1 ELSE 0 END as isReturn FROM sale_items WHERE sale_id = ?", [sale.id]));
                         return {...sale, items: items.map(i => ({...i, isReturn: !!i.isReturn}))};
                    });
                    const salesHistory = await Promise.all(salesHistoryPromises);
                    return {...shop, products, salesHistory};
                });
                const fullShopsData = await Promise.all(fullShopsDataPromises);
                setShops(fullShopsData);
            } else {
                setShops([]);
                setIsInitialSetup(currentUser.role === 'super_admin');
            }
            
            setUsers(usersFromDb);
            const customersFromDb = sqlResultToObjects(db.exec("SELECT * FROM customers ORDER BY name"));
            setCustomers(customersFromDb);
        };

        loadDataForUser().catch(console.error);
    }, [currentUser, db]);

    const handleCreateShop = async (name: string) => {
        const newShopId = Date.now();
        const newShop: Shop = {
            id: newShopId,
            name,
            products: [],
            salesHistory: [],
            nextProductId: 1,
        };
        db.run("INSERT INTO shops (id, name, nextProductId) VALUES (?, ?, ?)", [newShop.id, newShop.name, newShop.nextProductId]);
        await saveDbToIndexedDB();
        
        setShops(prev => [...prev, newShop]);
        setActiveShopId(newShop.id);
        localStorage.setItem(ACTIVE_SHOP_KEY, newShop.id.toString());
        setIsInitialSetup(false);
        setIsShopManagerOpen(false);
    };

    const handleSelectShop = (shopId: number) => {
        if (shopId === activeShopId) return;
        setActiveShopId(shopId);
        localStorage.setItem(ACTIVE_SHOP_KEY, shopId.toString());
        setCarts([defaultCartState, defaultCartState, defaultCartState]);
        setActiveCartIndex(0);
        setSelectedProductIds([]);
        setIsShopManagerOpen(false);
    };

    const handleSaveProduct = async (productData: Omit<Product, 'id'>) => {
        if (!activeShop) return;

        const newProduct = { ...productData, id: activeShop.nextProductId };
        db.run("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [newProduct.id, activeShop.id, newProduct.description, newProduct.descriptionTamil, newProduct.barcode, newProduct.b2bPrice, newProduct.b2cPrice, newProduct.stock, newProduct.category, newProduct.hsnCode]
        );
        db.run("UPDATE shops SET nextProductId = ? WHERE id = ?", [activeShop.nextProductId + 1, activeShop.id]);
        await saveDbToIndexedDB();

        const updatedShops = shops.map(s => s.id === activeShop.id ? {
            ...s,
            products: [...s.products, newProduct],
            nextProductId: s.nextProductId + 1,
        } : s);
        setShops(updatedShops);
        setIsProductModalOpen(false);
    };

    const handleUpdateProduct = async (updatedProduct: Product) => {
        if (!activeShop) return;
        db.run(
            `UPDATE products SET 
                description = ?, descriptionTamil = ?, barcode = ?, 
                b2bPrice = ?, b2cPrice = ?, stock = ?, category = ?, hsnCode = ?
            WHERE id = ? AND shop_id = ?`,
            [
                updatedProduct.description, updatedProduct.descriptionTamil, updatedProduct.barcode,
                updatedProduct.b2bPrice, updatedProduct.b2cPrice, updatedProduct.stock, updatedProduct.category, updatedProduct.hsnCode,
                updatedProduct.id, activeShop.id
            ]
        );
        await saveDbToIndexedDB();

        const updatedShops = shops.map(s => s.id === activeShop.id ? {
            ...s,
            products: s.products.map(p => p.id === updatedProduct.id ? updatedProduct : p)
        } : s);
        setShops(updatedShops);
        setIsProductModalOpen(false);
        setEditingProduct(null);
    };

    const handleAddNewProductFromSale = (description: string): Product | null => {
        if (!activeShop) return null;
        const trimmedDescription = description.trim();
        if (!trimmedDescription) return null;

        const newProduct: Product = { 
            id: activeShop.nextProductId, 
            description: trimmedDescription, 
            descriptionTamil: '', 
            barcode: '', 
            b2bPrice: 0, 
            b2cPrice: 0, 
            stock: 0, 
            category: '',
            hsnCode: '',
        };
        
        handleSaveProduct(newProduct);
        return newProduct;
    };

    const handleUpdateProductPrice = async (productId: number, newPrice: number, priceType: 'b2b' | 'b2c') => {
        if (!activeShop) return;
        const fieldToUpdate = priceType === 'b2b' ? 'b2bPrice' : 'b2cPrice';
        db.run(`UPDATE products SET ${fieldToUpdate} = ? WHERE id = ? AND shop_id = ?`, [newPrice, productId, activeShop.id]);
        await saveDbToIndexedDB();

        const updatedShops = shops.map(s => s.id === activeShop.id ? {
            ...s,
            products: s.products.map(p => p.id === productId ? { ...p, [fieldToUpdate]: newPrice } : p)
        } : s);
        setShops(updatedShops);
    };
    
    const handleUpdateProductDetails = async (productId: number, field: 'description' | 'descriptionTamil', value: string) => {
        if (!activeShop) return;
        db.run(`UPDATE products SET ${field} = ? WHERE id = ? AND shop_id = ?`, [value, productId, activeShop.id]);
        await saveDbToIndexedDB();
    
        const updatedShops = shops.map(s => s.id === activeShop.id ? {
            ...s,
            products: s.products.map(p => p.id === productId ? { ...p, [field]: value } : p)
        } : s);
        setShops(updatedShops);
    };

    const handleSingleDeleteRequest = (id: number) => {
        setProductIdsToDelete([id]);
        setIsConfirmModalOpen(true);
    };

    const handleBulkDeleteRequest = () => {
        setProductIdsToDelete(selectedProductIds);
        setIsConfirmModalOpen(true);
    };
    
    const handleConfirmDelete = async () => {
        if (productIdsToDelete.length === 0 || !activeShop) return;
        const placeholders = productIdsToDelete.map(() => '?').join(',');
        db.run(`DELETE FROM products WHERE id IN (${placeholders}) AND shop_id = ?`, [...productIdsToDelete, activeShop.id]);
        await saveDbToIndexedDB();

        const updatedShops = shops.map(s => s.id === activeShop.id ? {
            ...s,
            products: s.products.filter(p => !productIdsToDelete.includes(p.id))
        } : s);
        setShops(updatedShops);
        setProductIdsToDelete([]);
        setSelectedProductIds([]);
        setIsConfirmModalOpen(false);
    };

    const handleCancelDelete = () => {
        setProductIdsToDelete([]);
        setIsConfirmModalOpen(false);
    };

    const handleOpenProductModal = (product: Product | null = null) => {
        setEditingProduct(product);
        setIsProductModalOpen(true);
    };
    
    // --- CUSTOMER CRUD ---
    const handleOpenCustomerModal = (customer: Customer | null = null) => {
        setEditingCustomer(customer);
        setIsCustomerModalOpen(true);
    };
    
    const handleSaveOrUpdateCustomer = async (customerData: Omit<Customer, 'id'>) => {
        try {
            if (editingCustomer) { // Update
                const originalMobile = editingCustomer.mobile;
                const updatedCustomer = { ...editingCustomer, ...customerData };

                db.exec("BEGIN TRANSACTION;");
                db.run("UPDATE customers SET name = ?, mobile = ? WHERE id = ?", [updatedCustomer.name, updatedCustomer.mobile, updatedCustomer.id]);
                if (originalMobile !== updatedCustomer.mobile) {
                    db.run("UPDATE sales_history SET customerMobile = ? WHERE customerMobile = ?", [updatedCustomer.mobile, originalMobile]);
                }
                db.exec("COMMIT;");
                
                const updatedShops = shops.map(shop => ({
                    ...shop,
                    salesHistory: shop.salesHistory.map(sale => sale.customerMobile === originalMobile ? {...sale, customerMobile: updatedCustomer.mobile} : sale)
                }));
                setShops(updatedShops);

            } else { // Create
                db.run("INSERT INTO customers (name, mobile) VALUES (?, ?)", [customerData.name, customerData.mobile]);
            }
            await saveDbToIndexedDB();
            const customersFromDb = sqlResultToObjects(db.exec("SELECT * FROM customers ORDER BY name"));
            setCustomers(customersFromDb);
            setIsCustomerModalOpen(false);
            setEditingCustomer(null);
        } catch(e: any) {
             db.exec("ROLLBACK;");
             alert(`Failed to save customer. Error: ${e.message}. The mobile number might already exist.`);
        }
    };
    
    const handleConfirmDeleteCustomer = async () => {
        if (!customerToDelete) return;
        try {
            db.run("DELETE FROM customers WHERE id = ?", [customerToDelete.id]);
            await saveDbToIndexedDB();
            setCustomers(prev => prev.filter(c => c.id !== customerToDelete.id));
            setCustomerToDelete(null);
        } catch(e) {
            alert("Failed to delete customer.");
        }
    };

    // --- USER CRUD ---
    const refreshUsers = () => {
        if (!db || !currentUser) return;
        let usersFromDb = [];
        if (currentUser.role === 'super_admin') {
            usersFromDb = sqlResultToObjects(db.exec("SELECT id, username, role, shop_id FROM users"));
        } else if (currentUser.role === 'shop_admin') {
            usersFromDb = sqlResultToObjects(db.exec("SELECT id, username, role, shop_id FROM users WHERE shop_id = ?", [currentUser.shop_id]));
        }
        setUsers(usersFromDb);
    };

    const handleUserAdd = async (userData: any) => {
        if (!currentUser) return;
        try {
            const hashedPassword = await hashPassword(userData.password);
            const shopId = currentUser.role === 'super_admin' ? userData.shop_id : currentUser.shop_id;
            db.run("INSERT INTO users (username, password_hash, role, shop_id) VALUES (?, ?, ?, ?)",
                [userData.username.toLowerCase(), hashedPassword, userData.role, shopId]);
            await saveDbToIndexedDB();
            refreshUsers();
        } catch (e: any) {
            alert(`Error adding user: ${e.message}`);
        }
    };

    const handleUserUpdate = async (userData: any) => {
        try {
            if (userData.password) {
                const hashedPassword = await hashPassword(userData.password);
                db.run("UPDATE users SET username = ?, password_hash = ?, role = ?, shop_id = ? WHERE id = ?",
                    [userData.username.toLowerCase(), hashedPassword, userData.role, userData.shop_id, userData.id]);
            } else {
                db.run("UPDATE users SET username = ?, role = ?, shop_id = ? WHERE id = ?",
                    [userData.username.toLowerCase(), userData.role, userData.shop_id, userData.id]);
            }
            await saveDbToIndexedDB();
            refreshUsers();
        } catch (e: any) {
            alert(`Error updating user: ${e.message}`);
        }
    };
    
    const handleUserDelete = async (userId: number) => {
        try {
            db.run("DELETE FROM users WHERE id = ?", [userId]);
            await saveDbToIndexedDB();
            refreshUsers();
        } catch (e: any) {
             alert(`Error deleting user: ${e.message}`);
        }
    };

    // --- SALE CALCULATIONS & LOGIC ---

    // Calculate previous balance whenever customer mobile changes
    useEffect(() => {
        const calculatePreviousBalance = () => {
            const mobile = activeCart.customerMobile?.replace(/\s/g, ''); // Remove spaces for comparison
            if (!mobile || mobile.length < 10) { // Basic validation
                setPreviousBalancesDue(prev => {
                    const newBalances = [...prev];
                    newBalances[activeCartIndex] = 0;
                    return newBalances;
                });
                return;
            }
    
            let totalDue = 0;
            shops.forEach(shop => {
                shop.salesHistory.forEach(sale => {
                    if (sale.customerMobile?.replace(/\s/g, '') === mobile && sale.balance_due > 0) {
                        totalDue += sale.balance_due;
                    }
                });
            });
    
            setPreviousBalancesDue(prev => {
                const newBalances = [...prev];
                newBalances[activeCartIndex] = totalDue;
                return newBalances;
            });
        };
    
        calculatePreviousBalance();
    }, [activeCart.customerMobile, activeCartIndex, shops]);

    const subtotal = activeCart.items.reduce((acc, item) => {
        const itemTotal = item.quantity * item.price;
        return item.isReturn ? acc - itemTotal : acc + itemTotal;
    }, 0);
    const taxAmount = (subtotal - activeCart.discount) * (activeCart.tax / 100);
    const currentBillTotal = subtotal - activeCart.discount + taxAmount;
    const total = Math.round(currentBillTotal) + previousBalanceDue;
    const finalBalance = total - paidAmount;
    
    useEffect(() => {
        if (!amountPaidEdited) {
            setPaidAmount(total);
        }
    }, [total, activeCartIndex, amountPaidEdited]);

    
    const resetSale = () => {
        updateActiveCart(defaultCartState);
        setPaidAmount(0);
        setAmountPaidEditedFlags(prev => {
            const newFlags = [...prev];
            newFlags[activeCartIndex] = false;
            return newFlags;
        });
    };

    const handlePreviewRequest = () => {
        if (activeCart.items.length === 0 && previousBalanceDue <= 0) return;
        
        const shouldShowConfirmation = previousBalanceDue > 0 || finalBalance > 0;

        if (shouldShowConfirmation) {
            setIsSaleConfirmModalOpen(true);
        } else {
            setIsInvoiceModalOpen(true);
        }
    };

    const handleConfirmAndPreview = () => {
        setIsSaleConfirmModalOpen(false);
        setIsInvoiceModalOpen(true);
    };

    const handleFinalizeSale = async () => {
        if (!activeShop) return;
        
        const finalBalanceDue = total - paidAmount;
        const carriedBalance = previousBalanceDue;

        const saleRecord: Omit<SaleRecord, 'items'> = {
            id: `sale-${Date.now()}`,
            date: new Date().toISOString(),
            subtotal,
            discount: activeCart.discount,
            tax: taxAmount,
            total,
            paid_amount: paidAmount,
            balance_due: finalBalanceDue,
            customerName: activeCart.customerName,
            customerMobile: activeCart.customerMobile,
        };

        try {
            db.exec("BEGIN TRANSACTION;");

            // Clear previous balances if any were carried over
            if (carriedBalance > 0 && activeCart.customerMobile) {
                db.run(
                    "UPDATE sales_history SET balance_due = 0 WHERE customerMobile = ? AND balance_due > 0",
                    [activeCart.customerMobile]
                );
            }

            // Upsert customer if mobile and name are provided
            if (activeCart.customerMobile && activeCart.customerName) {
                db.run(
                    "INSERT INTO customers (name, mobile) VALUES (?, ?) ON CONFLICT(mobile) DO UPDATE SET name=excluded.name",
                    [activeCart.customerName, activeCart.customerMobile]
                );
            }

            db.run("INSERT INTO sales_history (id, shop_id, date, subtotal, discount, tax, total, paid_amount, balance_due, customerName, customerMobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                saleRecord.id, activeShop.id, saleRecord.date, saleRecord.subtotal, saleRecord.discount, saleRecord.tax, saleRecord.total, saleRecord.paid_amount, saleRecord.balance_due, saleRecord.customerName, saleRecord.customerMobile
            ]);
            
            // Log the initial payment if any
            if(paidAmount > 0) {
                 db.run("INSERT INTO payment_history (sale_id, date, amount_paid, payment_method) VALUES (?, ?, ?, ?)", [
                    saleRecord.id, saleRecord.date, paidAmount, 'Initial'
                ]);
            }

            const newProductsState = [...activeShop.products];
            activeCart.items.forEach(item => {
                db.run("INSERT INTO sale_items (sale_id, productId, shop_id, description, descriptionTamil, quantity, price, isReturn, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                    saleRecord.id, item.productId, activeShop.id, item.description, item.descriptionTamil, item.quantity, item.price, item.isReturn ? 1 : 0, item.hsnCode
                ]);
                const stockChange = item.isReturn ? item.quantity : -item.quantity;
                db.run("UPDATE products SET stock = stock + ? WHERE id = ? AND shop_id = ?", [stockChange, item.productId, activeShop.id]);
                const productIndex = newProductsState.findIndex(p => p.id === item.productId);
                if (productIndex > -1) newProductsState[productIndex].stock += stockChange;
            });
            db.exec("COMMIT;");
            await saveDbToIndexedDB();

            const fullSaleRecord = { ...saleRecord, items: activeCart.items };
            
            // Update local state to reflect the new sale and cleared balances
            const updatedShops = shops.map(s => {
                if (s.id === activeShop.id) {
                    let newHistory = [fullSaleRecord, ...s.salesHistory];
                    if (carriedBalance > 0 && activeCart.customerMobile) {
                        newHistory = newHistory.map(sale => {
                            if (sale.id !== fullSaleRecord.id && sale.customerMobile === activeCart.customerMobile && sale.balance_due > 0) {
                                return { ...sale, balance_due: 0 };
                            }
                            return sale;
                        });
                    }
                    return {
                        ...s,
                        products: newProductsState,
                        salesHistory: newHistory
                    };
                }
                return s;
            });
            setShops(updatedShops);
            
            // Refetch customers to reflect any new additions from the sale
            const customersFromDb = sqlResultToObjects(db.exec("SELECT * FROM customers ORDER BY name"));
            setCustomers(customersFromDb);
            
            resetSale();
            setIsInvoiceModalOpen(false);
        } catch(e) {
            console.error("Failed to finalize sale:", e);
            db.exec("ROLLBACK;");
            alert("An error occurred while saving the sale. Please try again.");
        }
    };
    
    const handleAddPayment = async (saleId: string, amount: number, method: string) => {
        if (!activeShop) return;
        try {
            db.exec("BEGIN TRANSACTION;");
            // Add to payment history
            db.run("INSERT INTO payment_history (sale_id, date, amount_paid, payment_method) VALUES (?, ?, ?, ?)", [
                saleId, new Date().toISOString(), amount, method
            ]);
            // Update the sales_history record
            db.run("UPDATE sales_history SET paid_amount = paid_amount + ?, balance_due = balance_due - ? WHERE id = ?", [
                amount, amount, saleId
            ]);
            db.exec("COMMIT;");
            await saveDbToIndexedDB();
            
            // Update local state
            const updatedShops = shops.map(s => {
                if (s.id === activeShop.id) {
                    return {
                        ...s,
                        salesHistory: s.salesHistory.map(sale => {
                            if (sale.id === saleId) {
                                return {
                                    ...sale,
                                    paid_amount: sale.paid_amount + amount,
                                    balance_due: sale.balance_due - amount,
                                };
                            }
                            return sale;
                        })
                    };
                }
                return s;
            });
            setShops(updatedShops);

        } catch(e) {
            console.error("Failed to add payment:", e);
            db.exec("ROLLBACK;");
            alert("An error occurred while adding the payment.");
        }
    };
    
    const handleSaveBackup = () => {
        if (!db) return alert("Database is not initialized.");
        try {
            const dbFile = db.export();
            const blob = new Blob([dbFile], { type: 'application/x-sqlite3' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            const shopName = activeShop ? activeShop.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'all_shops';
            a.href = url;
            a.download = `pos_backup_${shopName}_${date}.sqlite`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to create backup:", error);
            alert("Error: Could not create backup file.");
        }
    };

    const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        let startTime = 0;

        const formatEta = (seconds: number): string => {
            if (seconds < 1) return '< 1s';
            if (seconds < 60) return `${Math.round(seconds)}s`;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        };

        reader.onloadstart = () => {
            startTime = Date.now();
            setRestoreProgress({ visible: true, percentage: 0, eta: 'Calculating...', message: 'Reading File...' });
        };

        reader.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
                const percentage = (e.loaded / e.total) * 100;
                const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
                
                const speed = elapsedTime > 0 ? e.loaded / elapsedTime : 0;
                const remainingBytes = e.total - e.loaded;
                const remainingTime = speed > 0 ? remainingBytes / speed : Infinity;
                
                setRestoreProgress(prev => ({
                    ...prev,
                    percentage,
                    eta: isFinite(remainingTime) ? formatEta(remainingTime) : 'Calculating...'
                }));
            }
        };

        reader.onload = async (e) => {
            try {
                // Step 1: File read complete, now processing
                setRestoreProgress(prev => ({ ...prev, percentage: 100, eta: '0s', message: 'Processing Database...' }));
                await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update before blocking

                const arrayBuffer = e.target?.result as ArrayBuffer;
                const dbFile = new Uint8Array(arrayBuffer);
                
                // This is the blocking part
                const SQL = await initSqlJs({
                    locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
                });
                db = new SQL.Database(dbFile);

                // Step 2: Processing complete, now saving
                setRestoreProgress(prev => ({ ...prev, message: 'Saving to Browser...' }));
                await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update
                
                await saveDbToIndexedDB();

                // Step 3: All done
                setRestoreProgress(prev => ({ ...prev, message: 'Restore Complete!' }));
                await new Promise(resolve => setTimeout(resolve, 1000)); // Let user see the success message
                
                alert("Backup restored successfully! The app will now reload.");
                window.location.reload();

            } catch (error: any) {
                console.error("Failed to restore backup:", error);
                setRestoreProgress({ visible: false, percentage: 0, eta: '...', message: '' });
                alert(`Error: Could not restore backup. The file may be corrupt or not a valid SQLite database. Details: ${error.message}`);
            } finally {
                if (event.target) event.target.value = '';
            }
        };
        
        reader.onerror = () => {
             setRestoreProgress({ visible: false, percentage: 0, eta: '...', message: '' });
             alert("Error reading the file.");
             if (event.target) event.target.value = '';
        };

        reader.readAsArrayBuffer(file);
    };
    
    // --- BULK ADD LOGIC ---
    const processImageForProducts = async (base64ImageData: string, mimeType: string) => {
        setIsBulkAddLoading(true);
        setBulkAddError(null);
        setBulkAddProducts([]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imagePart = {
                inlineData: {
                    mimeType: mimeType,
                    data: base64ImageData,
                },
            };
            const textPart = {
                text: "Analyze the products in this image. Extract the product description in both English and Tamil (if available), and a suitable category for each item. Do not invent prices, stock levels, or barcodes. Return the data as a JSON array.",
            };

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [imagePart, textPart] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                description: {
                                    type: Type.STRING,
                                    description: 'The name or description of the product.',
                                },
                                descriptionTamil: {
                                    type: Type.STRING,
                                    description: 'The Tamil name or description of the product.',
                                },
                                category: {
                                    type: Type.STRING,
                                    description: 'A suitable category for the product (e.g., Fruits, Bakery, Dairy).',
                                },
                            },
                            required: ["description", "category"],
                        },
                    },
                },
            });
            
            const parsedProducts = extractAndParseJson(response.text);

            if (Array.isArray(parsedProducts)) {
                 const editableProducts: EditableProduct[] = parsedProducts.map(p => ({
                    description: p.description || '',
                    descriptionTamil: p.descriptionTamil || '',
                    category: p.category || '',
                    barcode: '',
                    b2bPrice: 0,
                    b2cPrice: 0,
                    stock: 0,
                }));
                setBulkAddProducts(editableProducts);
            } else {
                throw new Error("AI did not return a valid list of products.");
            }

        } catch (error: any) {
            console.error("Error processing image with Gemini:", error);
            setBulkAddError(error.message || "An unknown error occurred while analyzing the image.");
        } finally {
            setIsBulkAddLoading(false);
        }
    };
    
    const processPdfsForProducts = async (b2bPdfData: string, b2cPdfData: string) => {
        setIsBulkAddLoading(true);
        setBulkAddError(null);
        setBulkAddProducts([]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const systemInstruction = "You are an expert data extraction assistant specializing in retail product lists. Your task is to analyze PDF documents and accurately extract product information. You must differentiate between English and Tamil text for product descriptions and format the output as a JSON array based on the provided schema.";
            
            const userPrompt = {
                text: "From this PDF, extract the product list. For each item, identify the English description, the separate Tamil description, and the price from the 'Sal.Rate' column. If a Tamil description is not present for an item, leave that field as an empty string.",
            };
            
            const config = {
                 systemInstruction,
                 responseMimeType: "application/json",
                 responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            description: { 
                                type: Type.STRING, 
                                description: 'The full English name or description of the product. This should not contain any Tamil characters.' 
                            },
                            descriptionTamil: { 
                                type: Type.STRING, 
                                description: 'The Tamil name or description of the product. This should only contain Tamil characters if found. If not found, this must be an empty string.' 
                            },
                            price: { 
                                type: Type.NUMBER, 
                                description: 'The price of the product, extracted from the "Sal.Rate" column.' 
                            },
                        },
                        required: ["description", "price"],
                    },
                },
            };

            const b2bRequest = ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [{ inlineData: { mimeType: 'application/pdf', data: b2bPdfData } }, userPrompt] },
                config: config,
            });

            const b2cRequest = ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [{ inlineData: { mimeType: 'application/pdf', data: b2cPdfData } }, userPrompt] },
                config: config,
            });

            const [b2bResponse, b2cResponse] = await Promise.all([b2bRequest, b2cRequest]);

            const b2bResults = extractAndParseJson(b2bResponse.text);
            const b2cResults = extractAndParseJson(b2cResponse.text);
            
            if (!Array.isArray(b2bResults) || !Array.isArray(b2cResults)) {
                throw new Error("AI did not return a valid list of products from one or both documents.");
            }

            const mergedProductsMap = new Map<string, EditableProduct>();

            b2bResults.forEach(item => {
                const key = (item.description || '').trim().toLowerCase();
                if(key) {
                    mergedProductsMap.set(key, {
                        description: item.description,
                        descriptionTamil: item.descriptionTamil || '',
                        category: '',
                        barcode: '',
                        b2bPrice: item.price || 0,
                        b2cPrice: 0,
                        stock: 0,
                    });
                }
            });

            b2cResults.forEach(item => {
                const key = (item.description || '').trim().toLowerCase();
                if (key) {
                    const existing = mergedProductsMap.get(key);
                    if (existing) {
                        existing.b2cPrice = item.price || 0;
                         if (!existing.descriptionTamil && item.descriptionTamil) {
                            existing.descriptionTamil = item.descriptionTamil;
                        }
                    } else {
                        mergedProductsMap.set(key, {
                            description: item.description,
                            descriptionTamil: item.descriptionTamil || '',
                            category: '',
                            barcode: '',
                            b2bPrice: 0,
                            b2cPrice: item.price || 0,
                            stock: 0
                        });
                    }
                }
            });
            
            setBulkAddProducts(Array.from(mergedProductsMap.values()));

        } catch (error: any) {
            console.error("Error processing PDFs with Gemini:", error);
            setBulkAddError(error.message || "An unknown error occurred while analyzing the PDFs.");
        } finally {
            setIsBulkAddLoading(false);
        }
    };


    const handleFileSelectForBulkAdd = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setBulkAddFileSrc(result);
            setBulkAddFileType('image');
            setIsBulkAddModalOpen(true);
            const base64String = result.split(',')[1];
            processImageForProducts(base64String, file.type);
        };
        reader.readAsDataURL(file);
        event.target.value = ''; // Reset input to allow re-selection of the same file
    };

    const handleProcessPdfs = (b2bFile: File, b2cFile: File) => {
        setIsPdfUploadModalOpen(false);
        setBulkAddFileNames({ b2b: b2bFile.name, b2c: b2cFile.name });
        setIsBulkAddModalOpen(true);
        setBulkAddFileType('dual-pdf');

        const readerB2b = new FileReader();
        const readerB2c = new FileReader();
        let b2bData: string, b2cData: string;

        readerB2b.onload = (e) => {
            b2bData = (e.target?.result as string).split(',')[1];
            if (b2cData) processPdfsForProducts(b2bData, b2cData);
        };
        readerB2c.onload = (e) => {
            b2cData = (e.target?.result as string).split(',')[1];
            if (b2cData) processPdfsForProducts(b2bData, b2cData);
        };

        readerB2b.readAsDataURL(b2bFile);
        readerB2c.readAsDataURL(b2cFile);
    };

    const handleCloseBulkAddModal = () => {
        setIsBulkAddModalOpen(false);
        setBulkAddFileSrc(null);
        setBulkAddFileNames(null);
        setBulkAddFileType(null);
        setBulkAddProducts([]);
        setBulkAddError(null);
    };

    const handleSaveBulkProducts = async (newProducts: EditableProduct[]) => {
        if (!activeShop) return;
        
        db.exec("BEGIN TRANSACTION;");
        let currentId = activeShop.nextProductId;
        const productsToAdd: Product[] = [];
        try {
            newProducts.forEach(p => {
                const newProduct = { ...p, id: currentId++ };
                productsToAdd.push(newProduct);
                db.run("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category, hsnCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [newProduct.id, activeShop.id, newProduct.description, newProduct.descriptionTamil, newProduct.barcode, newProduct.b2bPrice, newProduct.b2cPrice, newProduct.stock, newProduct.category, newProduct.hsnCode]
                );
            });
            db.run("UPDATE shops SET nextProductId = ? WHERE id = ?", [currentId, activeShop.id]);
            db.exec("COMMIT;");
            await saveDbToIndexedDB();

            const updatedShops = shops.map(s => s.id === activeShop.id ? {
                ...s,
                products: [...s.products, ...productsToAdd],
                nextProductId: currentId,
            } : s);
            setShops(updatedShops);
            handleCloseBulkAddModal();
        } catch(e) {
            console.error("Bulk save failed", e);
            db.exec("ROLLBACK;");
            alert("An error occurred during bulk save. Please try again.");
        }
    };

    const deletionMessage = productIdsToDelete.length === 1 && activeShop
        ? `the product "${activeShop.products.find(p => p.id === productIdsToDelete[0])?.description}"`
        : `${productIdsToDelete.length} products`;
    
    // Sample sale for bill settings preview
    const sampleSaleForPreview: SaleRecord = {
        id: 'sample-123',
        date: new Date().toISOString(),
        items: [
            { id: 1, productId: 101, description: 'Sample Product A', quantity: 2, price: 150.0, isReturn: false, hsnCode: '1234' },
            { id: 2, productId: 102, description: 'Sample Product B (with a longer name)', quantity: 1, price: 399.50, isReturn: false, hsnCode: '5678' },
        ],
        subtotal: 699.50,
        discount: 50,
        tax: 64.95,
        total: 714.45,
        paid_amount: 715,
        balance_due: -0.55,
        customerName: 'John Doe',
        customerMobile: '9876543210'
    };


    if (dbLoading) {
        return (
            <div style={{...styles.appContainer, justifyContent: 'center', alignItems: 'center', minHeight: '400px'}}>
                <h2>Initializing Database...</h2>
                <p>Please wait. This may take a moment on the first run.</p>
            </div>
        );
    }

    if (!currentUser) {
        return <LoginView onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div style={styles.appContainer}>
            <nav style={styles.nav}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <DropdownNav 
                        activeView={activeView} 
                        onSelectView={setActiveView} 
                        disabled={!activeShop} 
                        currentUser={currentUser}
                    />
                    {activeView === 'sales' && activeShop && (
                        <div style={styles.billSelector}>
                            {[1, 2, 3].map((billNumber, index) => (
                                <button
                                    key={billNumber}
                                    onClick={() => setActiveCartIndex(index)}
                                    style={activeCartIndex === index ? {...styles.billButton, ...styles.billButtonActive} : styles.billButton}
                                    aria-label={`Switch to bill ${billNumber}`}
                                    aria-current={activeCartIndex === index}
                                >
                                    {billNumber}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <SessionDropdown
                        currentUser={currentUser}
                        activeShop={activeShop}
                        syncStatus={syncStatus}
                        isCloudSyncEnabled={isCloudSyncEnabled}
                        userPlan={userPlan}
                        onShopManagerClick={() => setIsShopManagerOpen(true)}
                        onLogout={handleLogout}
                    />
                </div>
            </nav>
            <main style={styles.mainContent}>
                {!activeShop && !isInitialSetup && <p style={styles.emptyMessage}>No shop selected. Please create or select a shop from the Shop Manager.</p>}
                {activeShop && activeView === 'sales' && 
                    <SalesView 
                        products={activeShop.products}
                        activeCart={activeCart}
                        updateActiveCart={updateActiveCart}
                        onPreview={handlePreviewRequest}
                        total={total}
                        paidAmount={paidAmount}
                        setPaidAmount={setPaidAmount}
                        onAmountPaidEdit={handleAmountPaidEdit}
                        previousBalanceDue={previousBalanceDue}
                        onShowHistory={() => setIsHistoryModalOpen(true)}
                        onSaveBackup={handleSaveBackup}
                        onRestoreBackup={handleRestoreBackup}
                        onUpdateProductPrice={handleUpdateProductPrice}
                        onUpdateProductDetails={handleUpdateProductDetails}
                        onAddNewProduct={handleAddNewProductFromSale}
                        isOnline={isOnline}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        currentUser={currentUser}
                    />
                }
                {activeShop && activeView === 'products' && 
                    <ProductsView 
                        products={activeShop.products}
                        onAdd={() => handleOpenProductModal()}
                        onEdit={handleOpenProductModal}
                        onDelete={handleSingleDeleteRequest}
                        onBulkAdd={handleFileSelectForBulkAdd}
                        onBulkAddPdfs={() => setIsPdfUploadModalOpen(true)}
                        selectedProductIds={selectedProductIds}
                        setSelectedProductIds={setSelectedProductIds}
                        onDeleteSelected={handleBulkDeleteRequest}
                        isOnline={isOnline}
                        aiUsage={{ plan: userPlan, count: aiUsage.count }}
                        onUpgrade={checkAndIncrementAiUsage}
                        currentUser={currentUser}
                    />
                }
                 {activeShop && activeView === 'balance_due' &&
                    <BalanceDueView
                        salesHistory={activeShop.salesHistory}
                        onAddPayment={(saleId, amount, method) => {
                            handleAddPayment(saleId, amount, method);
                        }}
                        onPrint={setSaleToPrint}
                    />
                }
                {activeShop && activeView === 'customers' &&
                    <CustomersView
                        customers={customers}
                        salesHistory={activeShop.salesHistory}
                        onAdd={() => handleOpenCustomerModal()}
                        onEdit={handleOpenCustomerModal}
                        onDelete={setCustomerToDelete}
                        currentUser={currentUser}
                    />
                }
                {activeShop && activeView === 'reports' && 
                    <ReportsView 
                        salesHistory={activeShop.salesHistory} 
                        onPrint={setSaleToPrint} 
                        userPlan={userPlan} 
                        onUpgrade={handleUpgradeRequest}
                        isOnline={isOnline}
                    />
                }
                {activeView === 'users' && 
                    <UsersView
                        currentUser={currentUser}
                        users={users}
                        shops={shops}
                        onUserAdd={handleUserAdd}
                        onUserUpdate={handleUserUpdate}
                        onUserDelete={handleUserDelete}
                    />
                }
                 {activeView === 'settings' && 
                    <SettingsView 
                        userPlan={userPlan} 
                        onRequestUpgrade={handleUpgradeRequest}
                        onDowngrade={handleDowngrade}
                        isCloudSyncEnabled={isCloudSyncEnabled}
                        onToggleCloudSync={toggleCloudSync}
                        onManageUsers={() => setActiveView('users')}
                        billSettings={billSettings}
                        onUpdateBillSettings={handleUpdateBillSettings}
                        onPreviewBill={() => setIsBillSettingsPreviewOpen(true)}
                    />
                }
                {isInitialSetup && <InitialSetupModal onCreate={handleCreateShop} />}
                {isShopManagerOpen && (
                    <ShopManagerModal 
                        shops={shops} 
                        activeShopId={activeShopId} 
                        onSelect={handleSelectShop} 
                        onCreate={handleCreateShop} 
                        onClose={() => setIsShopManagerOpen(false)}
                        userPlan={userPlan}
                        onUpgrade={handleUpgradeRequest}
                    />
                )}
                {isGoProModalOpen && <GoProModal onClose={() => setIsGoProModalOpen(false)} onUpgrade={handleUpgrade} />}
                {isProductModalOpen && 
                    <ProductFormModal 
                        product={editingProduct} 
                        onSave={handleSaveProduct} 
                        onUpdate={handleUpdateProduct} 
                        onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }} 
                    />
                }
                {isCustomerModalOpen &&
                    <CustomerFormModal
                        customer={editingCustomer}
                        onSave={handleSaveOrUpdateCustomer}
                        onClose={() => { setIsCustomerModalOpen(false); setEditingCustomer(null); }}
                    />
                }
                {customerToDelete &&
                    <ConfirmationModal
                        message={`Are you sure you want to delete ${customerToDelete.name}? This will remove the customer but their sales history will remain.`}
                        onConfirm={handleConfirmDeleteCustomer}
                        onCancel={() => setCustomerToDelete(null)}
                    />
                }
                {isSaleConfirmModalOpen && (
                    <SaleConfirmationModal
                        details={{
                            previousBalance: previousBalanceDue,
                            currentBill: currentBillTotal,
                            grandTotal: total,
                            amountPaid: paidAmount,
                            newBalance: finalBalance,
                        }}
                        onConfirm={handleConfirmAndPreview}
                        onCancel={() => setIsSaleConfirmModalOpen(false)}
                    />
                )}
                {isInvoiceModalOpen && 
                    <InvoicePreviewModal 
                        sale={{ ...activeCart, total, subtotal, tax: taxAmount, paid_amount: paidAmount, balance_due: finalBalance }}
                        billSettings={billSettings}
                        customerName={activeCart.customerName}
                        customerMobile={activeCart.customerMobile}
                        onFinalize={handleFinalizeSale}
                        onClose={() => setIsInvoiceModalOpen(false)}
                        onPrint={() => window.print()}
                        onWhatsApp={(number) => updateActiveCart({ customerMobile: number })}
                        language={activeCart.language}
                        previousBalanceDue={previousBalanceDue}
                        amountPaidEdited={amountPaidEdited}
                    />
                }
                {saleToPrint && 
                    <InvoicePreviewModal
                        sale={saleToPrint}
                        billSettings={billSettings}
                        customerName={saleToPrint.customerName}
                        customerMobile={saleToPrint.customerMobile}
                        onClose={() => setSaleToPrint(null)}
                        onPrint={() => window.print()}
                        onWhatsApp={() => {}} // No update needed for historical sales
                        language={'english'} // default to english for history
                        previousBalanceDue={0} // Historical invoices don't carry forward balances
                        amountPaidEdited={true} // Always show details for historical prints
                    />
                }
                 {isBillSettingsPreviewOpen &&
                    <InvoicePreviewModal
                        sale={sampleSaleForPreview}
                        billSettings={billSettings}
                        customerName={sampleSaleForPreview.customerName}
                        customerMobile={sampleSaleForPreview.customerMobile}
                        onClose={() => setIsBillSettingsPreviewOpen(false)}
                        onPrint={() => {
                            // To print from preview, we need to temporarily move the content
                            const content = document.querySelector('.invoice-preview-content-wrapper');
                            if (content) {
                                content.classList.add('printable-area');
                                window.print();
                                content.classList.remove('printable-area');
                            }
                        }}
                        language={'english'}
                        previousBalanceDue={0}
                        amountPaidEdited={true}
                        isPreviewMode={true}
                    />
                 }
                {isHistoryModalOpen && activeShop &&
                    <HistoryModal 
                        salesHistory={activeShop.salesHistory} 
                        customerMobile={activeCart.customerMobile} 
                        onClose={() => setIsHistoryModalOpen(false)} 
                    />
                }
                {isBulkAddModalOpen && (
                    <BulkAddModal
                        fileSrc={bulkAddFileSrc}
                        fileType={bulkAddFileType}
                        fileNames={bulkAddFileNames}
                        initialProducts={bulkAddProducts}
                        onSave={handleSaveBulkProducts}
                        onClose={handleCloseBulkAddModal}
                        loading={isBulkAddLoading}
                        error={bulkAddError}
                    />
                )}
                 {isPdfUploadModalOpen && (
                    <PdfUploadModal 
                        onProcess={handleProcessPdfs}
                        onClose={() => setIsPdfUploadModalOpen(false)}
                    />
                )}
                {isConfirmModalOpen && activeShop && (
                    <ConfirmationModal
                        message={`Are you sure you want to delete ${deletionMessage}? This action cannot be undone.`}
                        onConfirm={handleConfirmDelete}
                        onCancel={handleCancelDelete}
                    />
                )}
                {restoreProgress.visible && (
                    <RestoreProgressModal 
                        percentage={restoreProgress.percentage}
                        eta={restoreProgress.eta}
                        message={restoreProgress.message}
                    />
                )}
            </main>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    appContainer: {
        width: '100%',
        maxWidth: '1600px',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: '1.5rem',
        boxSizing: 'border-box',
    },
    nav: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '1rem'
    },
    navButton: {
        padding: '0.6rem 1rem',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: 500,
        color: 'var(--secondary-color)',
    },
    navButtonActive: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
    },
    billSelector: {
        display: 'flex',
        backgroundColor: 'var(--background-color)',
        borderRadius: '8px',
        padding: '0.25rem',
        border: '1px solid var(--border-color)',
    },
    billButton: {
        padding: '0.4rem 0.8rem',
        border: 'none',
        borderRadius: '6px',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        fontWeight: 500,
        color: 'var(--secondary-color)',
    },
    billButtonActive: {
        backgroundColor: 'var(--surface-color)',
        color: 'var(--primary-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    mainContent: {
        paddingTop: '1rem',
    },
    viewContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
    },
    viewHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
    },
    input: {
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        backgroundColor: 'var(--surface-color)',
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
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        backgroundColor: 'var(--background-color)',
        padding: '0.75rem 1rem',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
    },
    td: {
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-color)',
    },
    actionButton: {
        padding: '0.4rem 0.8rem',
        border: 'none',
        borderRadius: '6px',
        color: '#fff',
        cursor: 'pointer',
        marginRight: '0.5rem',
    },
    modalBackdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: 'var(--surface-color)',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        width: '90%',
        maxWidth: '600px',
    },
    modalActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        marginTop: '1.5rem',
    },
    productForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    label: {
        fontWeight: 'bold',
        marginBottom: '-0.5rem',
    },
    emptyMessage: {
        textAlign: 'center',
        padding: '2rem',
        color: 'var(--secondary-color)',
    },
    customerSection: {
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
    },
    customerInput: {
        flex: 2,
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
    },
    countryCodeInput: {
        flex: '0 0 70px',
        padding: '0.75rem 1rem',
        borderRadius: '8px 0 0 8px',
        border: '1px solid var(--border-color)',
        borderRight: 'none',
        fontSize: '1rem',
        textAlign: 'center',
    },
    mobileNumberInput: {
        flex: 1,
        padding: '0.75rem 1rem',
        borderRadius: '0 8px 8px 0',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
    },
    searchResults: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        listStyle: 'none',
        padding: 0,
        margin: '0.5rem 0 0',
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: 100,
    },
    searchResultItem: {
        padding: '0.75rem 1rem',
        cursor: 'pointer',
    },
    highlighted: {
        backgroundColor: 'var(--background-color)',
    },
    gridInput: {
        width: '80px',
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
    },
    wideGridInput: {
        width: '95%',
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        backgroundColor: '#fff',
        color: '#333'
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
        width: '100px',
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
    },
    grandTotal: {
        textAlign: 'right',
        marginLeft: '1rem',
        minWidth: '200px',
    },
    priceModeSelector: {
        display: 'flex',
        backgroundColor: 'var(--background-color)',
        borderRadius: '8px',
        padding: '0.25rem',
    },
    priceModeLabel: {
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 500,
        color: 'var(--secondary-color)',
    },
    priceModeLabel_input: {
        display: 'none',
    },
    priceModeLabelChecked: {
        backgroundColor: 'var(--surface-color)',
        color: 'var(--primary-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    voiceSearchButton: {
        position: 'absolute',
        right: '10px',
        top: '50%',
        transform: 'translateY(-50%)',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    barcodeScanButton: {
        position: 'absolute',
        right: '50px',
        top: '50%',
        transform: 'translateY(-50%)',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    shopListItem: {
        padding: '1rem',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-color)',
    },
    shopListItemActive: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        fontWeight: 'bold',
    },
    backupSection: {
        marginTop: '2rem',
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        backgroundColor: 'var(--background-color)',
    },
    backupTitle: {
        marginTop: 0,
    },
    backupDescription: {
        color: 'var(--secondary-color)',
        maxWidth: '600px',
    },
    backupActions: {
        display: 'flex',
        gap: '1rem',
        marginTop: '1rem',
    },
    settingsCard: {
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        marginBottom: '1.5rem',
    },
    featureListItem: {
        fontSize: '1.1rem',
        padding: '0.5rem 0',
    },
    proBadge: {
        position: 'absolute',
        top: '0',
        right: '0',
        transform: 'translate(50%, -50%)',
        backgroundColor: '#ffc107',
        color: 'black',
        padding: '0.2rem 0.5rem',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
    },
    proBadgeSmall: {
        backgroundColor: '#ffc107',
        color: 'black',
        padding: '0.1rem 0.4rem',
        borderRadius: '4px',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        marginTop: '0.25rem'
    },
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
        marginBottom: '1rem',
    },
    reportTabButton: {
        padding: '0.75rem 1.25rem',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
        color: 'var(--secondary-color)',
        borderBottom: '3px solid transparent',
    },
    reportTabButtonActive: {
        color: 'var(--primary-color)',
        borderBottom: '3px solid var(--primary-color)',
    },
    reportSummary: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
    },
    summaryCard: {
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        textAlign: 'center',
    },
    confirmationDetails: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        margin: '1rem 0',
    },
    confirmationRow: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    customerViewLayout: {
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: '1.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        minHeight: '70vh',
    },
    customerListPanel: {
        borderRight: '1px solid var(--border-color)',
    },
    customerListItem: {
        padding: '1rem',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-color)',
    },
    customerListItemActive: {
        backgroundColor: 'var(--background-color)',
        fontWeight: 'bold',
    },
    customerDetailPanel: {
        padding: '1.5rem',
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
        color: '#fff',
        padding: '0.2rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
    },
    settingsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
    },
    checkboxControl: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    dropdownContainer: {
        position: 'relative',
        display: 'inline-block',
    },
    dropdownButton: {
        backgroundColor: 'var(--background-color)',
        color: 'var(--text-color)',
        padding: '0.6rem 1rem',
        fontSize: '1rem',
        fontWeight: '500',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        minWidth: '180px',
        justifyContent: 'space-between',
    },
    dropdownMenu: {
        display: 'block',
        position: 'absolute',
        backgroundColor: 'var(--surface-color)',
        minWidth: '200px',
        boxShadow: '0 8px 16px 0 rgba(0,0,0,0.2)',
        zIndex: 1,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
    },
    dropdownMenuItem: {
        color: 'var(--text-color)',
        padding: '12px 16px',
        textDecoration: 'none',
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
    },
    dropdownMenuItemActive: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
    },
    sessionDropdownContainer: {
        position: 'relative',
    },
    sessionDropdownButton: {
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '0.5rem',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
    },
    sessionDropdownMenu: {
        position: 'absolute',
        right: 0,
        top: '120%',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        width: '250px',
        zIndex: 100,
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
    },
    sessionDropdownHeader: {
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--background-color)',
    },
    sessionDropdownInfoItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        fontSize: '0.9rem',
    },
    sessionDropdownSeparator: {
        border: 'none',
        borderTop: '1px solid var(--border-color)',
        margin: 0,
    },
    sessionDropdownMenuItem: {
        width: '100%',
        padding: '0.75rem 1rem',
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: '1rem',
    },
    mobileSingleColumnLayout: {
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 4rem)',
    },
    mobileScrollableContent: {
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        paddingBottom: '80px', // Space for bottom action bar
    },
    mobileBottomActionBar: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '1rem',
        backgroundColor: 'var(--surface-color)',
        borderTop: '1px solid var(--border-color)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
        zIndex: 100,
    },
    mobileFinalizeButton: {
        width: '100%',
        padding: '1rem',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        backgroundColor: 'var(--success-color)',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
    },
    mobileSection: {
        marginBottom: '1.5rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '1rem',
    },
    mobileSectionTitle: {
        marginTop: 0,
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.5rem',
        marginBottom: '1rem',
    },
    mobileInput: {
        width: '100%',
        padding: '0.8rem 1rem',
        fontSize: '1rem',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        boxSizing: 'border-box',
        marginBottom: '0.5rem',
    },
    mobileButton: {
        width: '100%',
        padding: '0.8rem 1rem',
        fontSize: '1rem',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
    },
    mobileInputIconButton: {
        position: 'absolute',
        right: '5px',
        top: '5px',
        bottom: '10px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '0.5rem',
    },
    mobileInlineSearchResults: {
        listStyle: 'none',
        padding: 0,
        margin: '0.5rem 0 0',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        maxHeight: '200px',
        overflowY: 'auto',
    },
    mobileInlineSearchResultItem: {
        padding: '0.75rem',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
    },
    mobileBillItemCard: {
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '0.75rem',
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
        backgroundColor: 'var(--surface-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    mobileSettingsGroup: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
    },
    mobileSettingsLabel: {
        fontWeight: 500,
    },
    mobilePaymentRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
    },
    mobilePaymentInput: {
        border: 'none',
        borderBottom: '1px solid var(--border-color)',
        borderRadius: 0,
        textAlign: 'right',
        width: '100px',
        fontSize: '1rem',
    },
    mobileGrandTotal: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 0',
        fontWeight: 'bold',
        fontSize: '1.2rem',
        borderTop: '1px solid var(--border-color)',
        marginTop: '0.5rem',
    },
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
