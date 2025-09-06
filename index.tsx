import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- SQL.js SETUP & DB HELPERS ---
declare const initSqlJs: any;
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
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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
            isReturn INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mobile TEXT NOT NULL UNIQUE
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

const getSetting = async (key: string): Promise<string | null> => {
    if (!db) return null;
    const res = sqlResultToObjects(db.exec("SELECT value FROM app_settings WHERE key = ?", [key]));
    return res.length > 0 ? res[0].value : null;
};

const setSetting = async (key: string, value: string) => {
    if (!db) return;
    db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, value]);
    await saveDbToIndexedDB();
};


// --- TYPE DEFINITIONS ---
interface SaleItem {
  id: number;
  productId: number;
  description: string;
  descriptionTamil?: string;
  quantity: number;
  price: number;
  isReturn: boolean;
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
}

interface SaleRecord {
    id: string;
    date: string; // ISO string
    items: SaleItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    customerName?: string;
    customerMobile?: string;
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


// --- PRODUCT FORM MODAL COMPONENT ---
const ProductFormModal = ({ product, onSave, onUpdate, onClose }: { product: Product | null, onSave: (product: Omit<Product, 'id'>) => void, onUpdate: (product: Product) => void, onClose: () => void }) => {
    type ProductFormData = Omit<Product, 'id' | 'b2bPrice' | 'b2cPrice' | 'stock'> & {
        b2bPrice: string | number;
        b2cPrice: string | number;
        stock: string | number;
    };
    
    const [formData, setFormData] = useState<ProductFormData>(
        product 
        ? { ...product, category: product.category || '', descriptionTamil: product.descriptionTamil || '' }
        : { description: '', descriptionTamil: '', barcode: '', b2bPrice: '', b2cPrice: '', stock: '', category: '' }
    );
    
    const descriptionRef = useRef<HTMLInputElement>(null);
    const descriptionTamilRef = useRef<HTMLInputElement>(null);
    const categoryRef = useRef<HTMLInputElement>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const b2bPriceRef = useRef<HTMLInputElement>(null);
    const b2cPriceRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
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
const ProductsView = ({ products, onEdit, onDelete, onAdd, onBulkAdd, onBulkAddPdfs, selectedProductIds, setSelectedProductIds, onDeleteSelected, isOnline }) => {
    const [filter, setFilter] = useState<'all' | 'low'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const bulkAddInputRef = useRef<HTMLInputElement>(null);

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
        
    const handleBulkAddClick = () => {
        bulkAddInputRef.current?.click();
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
                    {selectedProductIds.length > 0 && (
                         <button onClick={onDeleteSelected} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>
                            Delete Selected ({selectedProductIds.length})
                        </button>
                    )}
                     <button onClick={() => setFilter(filter === 'all' ? 'low' : 'all')} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                        {filter === 'all' ? 'Show Low Stock' : 'Show All Products'}
                    </button>
                    <input
                        type="file"
                        accept="image/*"
                        ref={bulkAddInputRef}
                        onChange={onBulkAdd}
                        style={{ display: 'none' }}
                        disabled={!isOnline}
                    />
                    {!isOnline && <span style={{ color: 'var(--danger-color)', fontSize: '0.9rem' }}>AI features disabled offline</span>}
                     <button onClick={handleBulkAddClick} style={{...styles.button, backgroundColor: '#ffc107', color: 'black'}} disabled={!isOnline}>Bulk Add from Image</button>
                     <button onClick={onBulkAddPdfs} style={{...styles.button, marginRight: '1rem', backgroundColor: 'var(--danger-color)'}} disabled={!isOnline}>Bulk Add from PDFs (B2B & B2C)</button>
                    <button onClick={onAdd} style={styles.button}>Add New Product</button>
                </div>
            </div>
            {filteredProducts.length > 0 ? (
                 <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={{...styles.th, width: '40px', padding: '0.75rem'}}>
                                <input
                                    type="checkbox"
                                    checked={areAllSelected}
                                    onChange={handleSelectAll}
                                    style={{width: '18px', height: '18px', verticalAlign: 'middle'}}
                                    aria-label="Select all products"
                                />
                            </th>
                            <th style={styles.th}>Description</th>
                            <th style={styles.th}>Description (Tamil)</th>
                            <th style={styles.th}>Category</th>
                            <th style={styles.th}>Barcode</th>
                            <th style={styles.th}>B2B Price</th>
                            <th style={styles.th}>B2C Price</th>
                            <th style={styles.th}>Stock</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map(p => (
                            <tr key={p.id} style={p.stock <= lowStockThreshold ? { backgroundColor: '#fffbe6'} : {}}>
                                <td style={styles.td}>
                                     <input
                                        type="checkbox"
                                        checked={selectedProductIds.includes(p.id)}
                                        onChange={() => handleSelectProduct(p.id)}
                                        style={{width: '18px', height: '18px', verticalAlign: 'middle'}}
                                        aria-label={`Select product ${p.description}`}
                                    />
                                </td>
                                <td style={styles.td}>{p.description}</td>
                                <td style={styles.td}>{p.descriptionTamil || 'N/A'}</td>
                                <td style={styles.td}>{p.category || 'N/A'}</td>
                                <td style={styles.td}>{p.barcode}</td>
                                <td style={styles.td}>₹{p.b2bPrice.toFixed(1)}</td>
                                <td style={styles.td}>₹{p.b2cPrice.toFixed(1)}</td>
                                <td style={{...styles.td, color: p.stock <= lowStockThreshold ? 'var(--danger-color)' : 'inherit', fontWeight: p.stock <= lowStockThreshold ? 'bold' : 'normal'}}>{p.stock}</td>
                                <td style={styles.td}>
                                    <button onClick={() => onEdit(p)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Edit</button>
                                    <button onClick={() => onDelete(p.id)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>Delete</button>
                                </td>
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

// --- INVOICE PREVIEW MODAL ---
const InvoicePreviewModal = ({ sale, customerName, customerMobile, onFinalize, onClose, onPrint, onWhatsApp, language }: {
    sale: any;
    customerName?: string;
    customerMobile?: string;
    onFinalize?: () => void;
    onClose?: () => void;
    onPrint?: () => void;
    onWhatsApp?: (number: string) => void;
    language: 'english' | 'tamil';
}) => {
    const [phoneNumber, setPhoneNumber] = useState(customerMobile || '');
    const printAreaRef = useRef<HTMLDivElement>(null);
    const previewWrapperRef = useRef<HTMLDivElement>(null);
    const [itemFontSize, setItemFontSize] = useState(12);

    // State for draggable margins (in pixels)
    const [margins, setMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
    const [dragging, setDragging] = useState<null | 'top' | 'right' | 'bottom' | 'left'>(null);

    const purchasedItems = sale.items.filter((item: SaleItem) => !item.isReturn);
    const returnedItems = sale.items.filter((item: SaleItem) => item.isReturn);

    const grossTotal = purchasedItems.reduce((acc: number, item: SaleItem) => acc + item.quantity * item.price, 0);
    const returnTotal = returnedItems.reduce((acc: number, item: SaleItem) => acc + item.quantity * item.price, 0);

    const saleDate = onFinalize ? new Date() : new Date(sale.date);

    // Event handler to start dragging a guideline
    const handleMouseDown = (side: 'top' | 'right' | 'bottom' | 'left', e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(side);
    };

    // Effect to handle mouse movement and release for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragging || !previewWrapperRef.current) return;

            const rect = previewWrapperRef.current.getBoundingClientRect();

            setMargins(prev => {
                const newMargins = { ...prev };
                if (dragging === 'top') {
                    newMargins.top = Math.max(0, e.clientY - rect.top);
                } else if (dragging === 'bottom') {
                    newMargins.bottom = Math.max(0, rect.bottom - e.clientY);
                } else if (dragging === 'left') {
                    newMargins.left = Math.max(0, e.clientX - rect.left);
                } else if (dragging === 'right') {
                    newMargins.right = Math.max(0, rect.right - e.clientX);
                }
                return newMargins;
            });
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging]);

    const handleSavePdf = () => {
        const element = printAreaRef.current;
        if (!element) return;
    
        // Temporarily hide non-printable elements
        const actions = document.querySelector('.invoice-actions') as HTMLElement;
        const guides = document.querySelectorAll('.margin-guide') as NodeListOf<HTMLElement>;
        if (actions) actions.style.display = 'none';
        guides.forEach(g => g.style.display = 'none');
        
        const dateStr = saleDate.toISOString().slice(0, 10);
        const customerIdentifier = customerName ? customerName.replace(/ /g, '_') : 'customer';
        const filename = `invoice-${customerIdentifier}-${dateStr}.pdf`;
    
        // Convert pixel margins to inches for jsPDF (assuming 96 DPI)
        const dpi = 96;
        const opt = {
          margin: [margins.top / dpi, margins.left / dpi, margins.bottom / dpi, margins.right / dpi],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: [4, 6], orientation: 'portrait' }
        };
    
        (window as any).html2pdf().set(opt).from(element).save().then(() => {
            // Show the elements again after the PDF has been generated
            if (actions) actions.style.display = 'flex';
            guides.forEach(g => g.style.display = 'block');
        });
    };

    const handleWhatsAppClick = () => {
        if (!phoneNumber) {
            alert('Please enter a customer phone number.');
            return;
        }
        if (!onWhatsApp) return;

        const getItemDescription = (item: SaleItem) => language === 'tamil' && item.descriptionTamil ? item.descriptionTamil : item.description;

        const purchasedItemsText = purchasedItems.length > 0
            ? '--- Purchased Items ---\n' + purchasedItems.map((item: SaleItem) =>
                `${getItemDescription(item)} (Qty: ${item.quantity} x ₹${item.price.toFixed(1)} = ₹${(item.quantity * item.price).toFixed(1)})`
            ).join('\n')
            : '';
        
        const returnedItemsText = returnedItems.length > 0
            ? '\n--- Returned Items ---\n' + returnedItems.map((item: SaleItem) =>
                `${getItemDescription(item)} (Qty: ${item.quantity} x ₹${item.price.toFixed(1)} = ₹${(item.quantity * item.price).toFixed(1)})`
            ).join('\n')
            : '';

        const message = `
Hello ${customerName || 'Valued Customer'},

Here is your invoice summary:
${purchasedItemsText}
${returnedItemsText}
-----------------------------------
Gross Total: ₹${grossTotal.toFixed(1)}
${returnTotal > 0 ? `Total Returns: -₹${returnTotal.toFixed(1)}` : ''}
-----------------------------------
Subtotal: ₹${sale.subtotal.toFixed(1)}
${sale.discount > 0 ? `Discount: -₹${sale.discount.toFixed(1)}` : ''}
${sale.tax > 0 ? `Tax: ₹${sale.tax.toFixed(1)}` : ''}
Grand Total: ₹${sale.total.toFixed(1)}
-----------------------------------
Thank you for your purchase!
Goods once sold cannot be taken back.
        `.trim().replace(/^\s*\n/gm, ''); // Clean up extra lines

        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        onWhatsApp(phoneNumber);
    };

    const renderTable = (items: SaleItem[], title: string, isReturn = false) => (
        <>
            {title && <h4 style={{ margin: '0.8rem 0 0.4rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>{title}</h4>}
            <table style={{...styles.table, fontSize: '10pt', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed'}}>
                <thead>
                    <tr>
                        <th style={{...styles.th, textAlign: 'left', padding: '2px', width: '30px'}}>S.No.</th>
                        <th style={{...styles.th, textAlign: 'left', padding: '2px', width: '50%'}}>Item</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Qty</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Price</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={item.id} style={isReturn ? {color: 'var(--danger-color)'} : {}}>
                            <td style={{...styles.td, padding: '2px', textAlign: 'center'}}>{index + 1}</td>
                            <td style={{
                                ...styles.td, 
                                padding: '2px', 
                                fontWeight: 'bold', 
                                fontSize: `${itemFontSize}pt`,
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                             }}>
                                {language === 'tamil' && item.descriptionTamil ? item.descriptionTamil : item.description}
                            </td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.quantity}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.price.toFixed(1)}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{(item.quantity * item.price).toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );

    return (
        <div className="invoice-preview-backdrop" style={styles.modalBackdrop}>
            <div ref={previewWrapperRef} className="invoice-preview-content-wrapper" style={{...styles.modalContent, position: 'relative', maxWidth: '4.5in', padding: '0.5rem', maxHeight: '90vh', overflowY: 'auto'}}>
                 <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem', paddingRight: '0.2in' }}>
                    <label htmlFor="fontSizeSelect" style={{fontSize: '10pt', fontWeight: 500}}>Item Font Size:</label>
                    <select
                        id="fontSizeSelect"
                        value={itemFontSize}
                        onChange={(e) => setItemFontSize(Number(e.target.value))}
                        style={{ ...styles.input, padding: '0.2rem', height: 'auto', fontSize: '10pt', border: '1px solid var(--border-color)' }}
                    >
                        <option value="9">9pt</option>
                        <option value="10">10pt</option>
                        <option value="11">11pt</option>
                        <option value="12">12pt</option>
                        <option value="13">13pt</option>
                        <option value="14">14pt</option>
                    </select>
                </div>

                {/* Draggable Margin Guidelines */}
                <div className="margin-guide no-print" onMouseDown={(e) => handleMouseDown('top', e)} style={{...styles.marginGuide, ...styles.marginGuideHorizontal, top: `${margins.top}px`}} />
                <div className="margin-guide no-print" onMouseDown={(e) => handleMouseDown('bottom', e)} style={{...styles.marginGuide, ...styles.marginGuideHorizontal, bottom: `${margins.bottom}px`}} />
                <div className="margin-guide no-print" onMouseDown={(e) => handleMouseDown('left', e)} style={{...styles.marginGuide, ...styles.marginGuideVertical, left: `${margins.left}px`}} />
                <div className="margin-guide no-print" onMouseDown={(e) => handleMouseDown('right', e)} style={{...styles.marginGuide, ...styles.marginGuideVertical, right: `${margins.right}px`}} />

                <div ref={printAreaRef} id="invoice-to-print" style={{padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`}}>
                    <div style={{textAlign: 'center', marginBottom: '0.5rem'}}>
                        <h2 style={{margin: '0'}}>Invoice</h2>
                        <p style={{margin: '0'}}>Date: {saleDate.toLocaleString()}</p>
                    </div>

                    {customerName && <p style={{margin: '0.2rem 0'}}><b>Customer:</b> {customerName}</p>}
                    {customerMobile && <p style={{margin: '0.2rem 0'}}><b>Mobile:</b> {customerMobile}</p>}

                    {purchasedItems.length > 0 && renderTable(purchasedItems, '')}
                    {returnedItems.length > 0 && renderTable(returnedItems, 'Returned Items', true)}

                    <hr style={{border: '1px dashed #ccc', margin: '0.5rem 0'}}/>

                    <div style={{textAlign: 'right', fontSize: '10pt'}}>
                        {purchasedItems.length > 0 && <p style={{margin: '2px 0'}}><b>Gross Total:</b> ₹{grossTotal.toFixed(1)}</p>}
                        {returnedItems.length > 0 && <p style={{margin: '2px 0', color: 'var(--danger-color)'}}><b>Total Returns:</b> -₹{returnTotal.toFixed(1)}</p>}
                        <p style={{margin: '2px 0'}}><b>Subtotal:</b> ₹{sale.subtotal.toFixed(1)}</p>
                        {sale.discount > 0 && <p style={{margin: '2px 0'}}><b>Discount:</b> -₹{sale.discount.toFixed(1)}</p>}
                        {sale.tax > 0 && <p style={{margin: '2px 0'}}><b>Tax:</b> ₹{sale.tax.toFixed(1)}</p>}
                        <p style={{margin: '2px 0', fontSize: '12pt'}}><b>Grand Total:</b> ₹{sale.total.toFixed(1)}</p>
                    </div>

                    <p style={{textAlign: 'center', fontSize: '9pt', marginTop: '1rem'}}>
                        Goods once sold cannot be taken back.
                    </p>
                </div>
                 <div className="invoice-actions" style={{...styles.modalActions, marginTop: '1.5rem', flexWrap: 'wrap', padding: '0 0.2in 0.2in 0.2in'}}>
                    {onWhatsApp && (
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
                    {onPrint && <button onClick={handleSavePdf} style={{...styles.button, backgroundColor: '#007bff'}}>Save as PDF</button>}
                    {onPrint && <button onClick={onPrint} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Print</button>}
                    {onFinalize && <button onClick={onFinalize} style={{...styles.button, backgroundColor: 'var(--success-color)'}}>Finalize Sale</button>}
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
const ReportsView = ({ salesHistory, onPrint }) => {
    const [filterType, setFilterType] = useState('today');
    const todayISO = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(todayISO);
    const [endDate, setEndDate] = useState(todayISO);
    const [expandedSale, setExpandedSale] = useState<string | null>(null);

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

    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalItemsSold = filteredSales.reduce((sum, sale) => sum + sale.items.filter(i => !i.isReturn).length, 0);
    const totalTransactions = filteredSales.length;

    const getReportTitle = () => {
        switch (filterType) {
            case 'today':
                return `Today's Sales Report`;
            case 'yesterday':
                return `Yesterday's Sales Report`;
            case 'this_week':
                return `This Week's Sales Report`;
            case 'this_month':
                return `This Month's Sales Report`;
            case 'custom':
                 if (startDate === endDate) return `Sales Report for ${new Date(start).toLocaleDateString()}`;
                return `Sales Report from ${new Date(start).toLocaleDateString()} to ${new Date(end).toLocaleDateString()}`;
            default:
                return 'Sales Report';
        }
    };
    
    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>{getReportTitle()}</h2>
                <div style={styles.reportFilters}>
                    <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{...styles.input, height: 'auto'}}>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="this_week">This Week</option>
                        <option value="this_month">This Month</option>
                        <option value="custom">Custom Range</option>
                    </select>
                    {filterType === 'custom' && (
                        <div style={styles.dateRangePicker}>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={styles.input} />
                            <span style={{color: 'var(--secondary-color)'}}>to</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={styles.input} />
                        </div>
                    )}
                </div>
            </div>
            <div style={styles.reportSummary}>
                 <div style={styles.summaryCard}><h3>Total Revenue</h3><p>₹{totalRevenue.toFixed(1)}</p></div>
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
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSales.map(sale => (
                            <React.Fragment key={sale.id}>
                                <tr>
                                    <td style={styles.td}>{new Date(sale.date).toLocaleString()}</td>
                                    <td style={styles.td}>{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td>
                                    <td style={styles.td}>{sale.items.length}</td>
                                    <td style={styles.td}>₹{sale.total.toFixed(1)}</td>
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
                                        <td colSpan={5} style={{padding: '0.5rem', backgroundColor: '#f9f9f9'}}>
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
        </div>
    );
};


// --- CUSTOMERS VIEW COMPONENT ---
const CustomersView = ({ customers, salesHistory, onAdd, onEdit, onDelete }) => {
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobile.includes(searchQuery)
    );
    
    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    
    const customerSales = selectedCustomer 
        ? salesHistory.filter(s => s.customerMobile === selectedCustomer.mobile).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        : [];
        
    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomerId(customer.id);
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Customer Management</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={onAdd} style={styles.button}>Add New Customer</button>
                </div>
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
                                </div>
                                <div style={{display: 'flex', gap: '0.5rem'}}>
                                    <button onClick={() => onEdit(selectedCustomer)} style={{...styles.actionButton, backgroundColor: '#ffc107'}}>Edit</button>
                                    <button onClick={() => onDelete(selectedCustomer)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>Delete</button>
                                </div>
                            </div>
                            <h4>Purchase History</h4>
                            <div style={{maxHeight: '55vh', overflowY: 'auto'}}>
                                {customerSales.length > 0 ? (
                                    customerSales.map(sale => (
                                        <div key={sale.id} style={styles.purchaseHistoryItem}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                                <strong>{new Date(sale.date).toLocaleString()}</strong>
                                                <strong>Total: ₹{sale.total.toFixed(1)}</strong>
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


// --- SALES VIEW COMPONENT ---
const SalesView = ({ 
    products, 
    activeCart,
    updateActiveCart,
    onPreview, 
    total,
    onShowHistory,
    onSaveBackup,
    onRestoreBackup,
    onUpdateProductPrice,
    onAddNewProduct,
    isOnline,
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
            };
            updateActiveCart({ items: [...activeCart.items, newItem] });
            // The index for the new item will be the current length of the items array
            // before the state update is committed.
            focusIndex = activeCart.items.length; 
        }

        setSearchTerm('');
        setSearchResults([]);
        setHighlightedIndex(-1);
        
        if (focusOnQuantity && focusIndex > -1) {
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

        // If the price was changed, update the product in the main inventory
        if (field === 'price') {
            const updatedItem = updatedItems.find(item => item.id === id);
            if (updatedItem) {
                onUpdateProductPrice(updatedItem.productId, parseFloat(String(value)) || 0, priceMode);
            }
        }
    };
    
    const handleRemoveSaleItem = (id: number) => {
        updateActiveCart({ items: activeCart.items.filter(item => item.id !== id) });
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const hasResults = searchResults.length > 0;
        const canAddNew = searchTerm.trim() !== '' && !hasResults;

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
            const priceInput = priceInputRefs.current[index];
            priceInput?.focus();
            priceInput?.select();
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


    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>New Sale</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={styles.priceModeSelector}>
                        <label style={styles.priceModeLabel}>
                            <input
                                type="radio"
                                name="priceMode"
                                value="b2c"
                                checked={priceMode === 'b2c'}
                                onChange={() => setPriceMode('b2c')}
                            />
                            B2C
                        </label>
                        <label style={styles.priceModeLabel}>
                            <input
                                type="radio"
                                name="priceMode"
                                value="b2b"
                                checked={priceMode === 'b2b'}
                                onChange={() => setPriceMode('b2b')}
                            />
                            B2B
                        </label>
                    </div>
                     <div style={styles.priceModeSelector}>
                        <label style={styles.priceModeLabel}>
                            <input
                                type="radio"
                                name="language"
                                value="english"
                                checked={activeCart.language === 'english'}
                                onChange={() => updateActiveCart({ language: 'english' })}
                            />
                            English
                        </label>
                        <label style={styles.priceModeLabel}>
                            <input
                                type="radio"
                                name="language"
                                value="tamil"
                                checked={activeCart.language === 'tamil'}
                                onChange={() => updateActiveCart({ language: 'tamil' })}
                            />
                            Tamil
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
                    <input
                        type="text"
                        value={localCountryCode}
                        onChange={handleCountryCodeChange}
                        placeholder="+91"
                        style={styles.countryCodeInput}
                    />
                    <input 
                        ref={customerMobileRef}
                        type="tel" 
                        value={localMobileNumber} 
                        onChange={handleMobileNumberChange}
                        placeholder="Customer Mobile"
                        style={styles.mobileNumberInput}
                        onKeyDown={(e) => handleCustomerKeyDown(e, 'product')}
                    />
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
                    <ul style={styles.searchResults}>
                        {searchResults.map((p, index) => (
                            <li
                                key={p.id}
                                onClick={() => handleAddToSale(p)}
                                style={index === highlightedIndex ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {/* Fix: Corrected typo from c2cPrice to b2cPrice */}
                                {p.description} {p.descriptionTamil && `(${p.descriptionTamil})`} (₹{(priceMode === 'b2b' ? p.b2bPrice : p.b2cPrice).toFixed(1)}) - Stock: {p.stock}
                            </li>
                        ))}
                        {searchResults.length === 0 && searchTerm.trim() !== '' && (
                            <li
                                onClick={handleCreateAndAddProduct}
                                style={highlightedIndex === 0 ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem}
                                onMouseEnter={() => setHighlightedIndex(0)}
                            >
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
                            <th style={styles.th}>Description</th>
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
                                    <td style={styles.td}>{activeCart.language === 'tamil' && item.descriptionTamil ? item.descriptionTamil : item.description}</td>
                                    <td style={styles.td}>
                                        <input
                                            ref={el => { quantityInputRefs.current[index] = el; }}
                                            type="number"
                                            step="0.001"
                                            value={item.quantity}
                                            onChange={(e) => handleUpdateSaleItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                            style={styles.gridInput}
                                            onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                                        />
                                    </td>
                                    <td style={styles.td}>
                                        <input
                                            ref={el => { priceInputRefs.current[index] = el; }}
                                            type="number"
                                            step="0.01"
                                            value={item.price}
                                            onChange={(e) => handleUpdateSaleItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                                            style={styles.gridInput}
                                            onKeyDown={handlePriceKeyDown}
                                        />
                                    </td>
                                    <td style={styles.td}>₹{itemTotal.toFixed(1)}</td>
                                    <td style={styles.td}>
                                        <input 
                                            type="checkbox" 
                                            checked={item.isReturn} 
                                            onChange={(e) => handleUpdateSaleItem(item.id, 'isReturn', e.target.checked)} 
                                            style={{width: '20px', height: '20px'}}
                                        />
                                    </td>
                                    <td style={styles.td}>
                                        <button onClick={() => handleRemoveSaleItem(item.id)} style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}}>X</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {activeCart.items.length === 0 && <p style={styles.emptyMessage}>No items in sale.</p>}
            </div>

            <div style={styles.totalsSection}>
                <div>
                    <label>Discount (₹)</label>
                    <input type="number" step="0.01" value={activeCart.discount} onChange={(e) => updateActiveCart({ discount: parseFloat(e.target.value) || 0 })} style={styles.totalsInput}/>
                </div>
                <div>
                    <label>Tax (%)</label>
                    <input type="number" step="0.01" value={activeCart.tax} onChange={(e) => updateActiveCart({ tax: parseFloat(e.target.value) || 0 })} style={styles.totalsInput}/>
                </div>
                <button 
                    onClick={onPreview} 
                    style={{...styles.button, backgroundColor: 'var(--success-color)'}} 
                    disabled={activeCart.items.length === 0}
                >
                    Preview Invoice
                </button>
                <div style={styles.grandTotal}>
                    <h3>Grand Total: ₹{total.toFixed(1)}</h3>
                </div>
            </div>
            
            <div style={styles.backupSection}>
                <h3 style={styles.backupTitle}>Database Backup & Restore</h3>
                <p style={styles.backupDescription}>
                    Save your entire application database (all shops, products, and sales) to a single file, or restore it from a previous backup.
                </p>
                <div style={styles.backupActions}>
                    <button onClick={onSaveBackup} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                        Save Backup to Disk
                    </button>
                    <label style={{...styles.button, backgroundColor: 'var(--success-color)', cursor: 'pointer'}}>
                        Load Backup from Disk
                        <input
                            type="file"
                            accept=".sqlite,.db"
                            style={{ display: 'none' }}
                            onChange={onRestoreBackup}
                        />
                    </label>
                </div>
            </div>
            {isScannerOpen && (
                <BarcodeScannerModal 
                    onScan={handleBarcodeScanned}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}
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
const ShopManagerModal = ({ shops, activeShopId, onSelect, onCreate, onClose }: {
    shops: Shop[],
    activeShopId: number | null,
    onSelect: (shopId: number) => void,
    onCreate: (shopName: string) => void,
    onClose: () => void,
}) => {
    const [newShopName, setNewShopName] = useState('');
    const newShopInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        newShopInputRef.current?.focus();
    }, []);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
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
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <input
                            ref={newShopInputRef}
                            type="text"
                            value={newShopName}
                            onChange={e => setNewShopName(e.target.value)}
                            placeholder="New Shop Name"
                            style={{ ...styles.input, flex: 1 }}
                            required
                        />
                        <button type="submit" style={styles.button}>Create</button>
                    </div>
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


// --- LOGIN VIEW COMPONENT ---
const LoginView = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
    type View = 'loading' | 'create' | 'login' | 'reset_start' | 'reset_otp';
    const [view, setView] = useState<View>('loading');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetIdentifier, setResetIdentifier] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const passwordInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const checkPassword = async () => {
            const storedPasswordHash = await getSetting('admin_password');
            if (storedPasswordHash) {
                setView('login');
                // Use a short timeout to ensure the input is rendered before focusing
                setTimeout(() => passwordInputRef.current?.focus(), 100);
            } else {
                setView('create');
            }
        };
        checkPassword();
    }, []);

    const handleCreatePassword = async (e: React.FormEvent) => {
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
            await setSetting('admin_password', hashedPassword);
            onLoginSuccess();
        } catch (err) {
            setError('Failed to create password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const storedPasswordHash = await getSetting('admin_password');
            const enteredPasswordHash = await hashPassword(password);
            if (storedPasswordHash === enteredPasswordHash) {
                onLoginSuccess();
            } else {
                setError('Invalid password.');
                setPassword('');
            }
        } catch (err) {
            setError('An error occurred during login. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSendOtp = (e: React.FormEvent) => {
        e.preventDefault();
        if(!resetIdentifier) {
            setError('Please enter your email or mobile number.');
            return;
        }
        setError('');
        setView('reset_otp');
    };
    
    const handleVerifyOtp = (e: React.FormEvent) => {
        e.preventDefault();
        if(otp === '123456') { // Dummy OTP
            onLoginSuccess();
        } else {
            setError('Invalid OTP. Please try again.');
            setOtp('');
        }
    };

    const renderContent = () => {
        switch (view) {
            case 'create':
                return (
                    <>
                        <h2 style={loginStyles.title}>Create Admin Password</h2>
                        <p style={loginStyles.subtitle}>Set a password to secure your POS system.</p>
                        <form onSubmit={handleCreatePassword}>
                            <input style={loginStyles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New Password" required />
                            <input style={loginStyles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm Password" required />
                            <button style={loginStyles.button} type="submit" disabled={isLoading}>{isLoading ? 'Saving...' : 'Create Password'}</button>
                        </form>
                    </>
                );
            case 'login':
                return (
                    <>
                        <h2 style={loginStyles.title}>Admin Login</h2>
                        <form onSubmit={handleLogin}>
                             <input style={{...loginStyles.input, backgroundColor: '#e9ecef', cursor: 'not-allowed'}} type="text" value="admin" readOnly disabled />
                             <input ref={passwordInputRef} style={loginStyles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                             <button style={loginStyles.button} type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</button>
                        </form>
                        <button onClick={() => setView('reset_start')} style={loginStyles.linkButton}>Forgot Password?</button>
                    </>
                );
            case 'reset_start':
                 return (
                    <>
                        <h2 style={loginStyles.title}>Reset Password</h2>
                        <p style={loginStyles.subtitle}>Enter your email or mobile to receive an OTP.</p>
                        <form onSubmit={handleSendOtp}>
                             <input style={loginStyles.input} type="text" value={resetIdentifier} onChange={e => setResetIdentifier(e.target.value)} placeholder="Gmail ID or Mobile Number" required />
                             <button style={loginStyles.button} type="submit">Send OTP</button>
                        </form>
                        <button onClick={() => setView('login')} style={loginStyles.linkButton}>Back to Login</button>
                    </>
                );
            case 'reset_otp':
                 return (
                    <>
                        <h2 style={loginStyles.title}>Enter OTP</h2>
                        <p style={loginStyles.subtitle}>An OTP has been sent to {resetIdentifier}.</p>
                        <p style={{textAlign: 'center', fontSize: '0.9rem', color: 'var(--secondary-color)'}}>(Hint: The OTP is 123456)</p>
                        <form onSubmit={handleVerifyOtp}>
                             <input style={loginStyles.input} type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter OTP" required />
                             <button style={loginStyles.button} type="submit">Verify & Login</button>
                        </form>
                        <button onClick={() => setView('reset_start')} style={loginStyles.linkButton}>Go Back</button>
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


// --- MAIN APP COMPONENT ---
const App = () => {
    const [dbLoading, setDbLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeView, setActiveView] = useState('sales');
    
    // Multi-Shop State
    const [shops, setShops] = useState<Shop[]>([]);
    const [activeShopId, setActiveShopId] = useState<number | null>(null);
    const [isShopManagerOpen, setIsShopManagerOpen] = useState(false);
    const [isInitialSetup, setIsInitialSetup] = useState(false);

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

    const activeCart = carts[activeCartIndex] || defaultCartState;

    const updateActiveCart = (updatedData: Partial<CartState>) => {
        setCarts(prevCarts => {
            const newCarts = [...prevCarts];
            const currentCart = newCarts[activeCartIndex] || defaultCartState;
            newCarts[activeCartIndex] = { ...currentCart, ...updatedData };
            return newCarts;
        });
    };

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
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

    useEffect(() => {
        // Check session storage on initial load to maintain login state across refreshes
        const loggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
        if (loggedIn) {
            setIsAuthenticated(true);
        }

        const setOnline = () => setIsOnline(true);
        const setOffline = () => setIsOnline(false);

        window.addEventListener('online', setOnline);
        window.addEventListener('offline', setOffline);

        return () => {
            window.removeEventListener('online', setOnline);
            window.removeEventListener('offline', setOffline);
        };
    }, []);

    const handleLoginSuccess = () => {
        sessionStorage.setItem('isLoggedIn', 'true');
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isLoggedIn');
        setIsAuthenticated(false);
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

    
    // Load data from DB on initial render
    useEffect(() => {
        const migrateFromLocalStorage = async () => {
            console.log("Checking for localStorage data to migrate...");
            const STORAGE_KEY = 'pos-multi-shop-data';
            const storedShopsRaw = localStorage.getItem(STORAGE_KEY);
            if (!storedShopsRaw) {
                console.log("No localStorage data found. Skipping migration.");
                return;
            }
            
            try {
                const storedShops: Shop[] = JSON.parse(storedShopsRaw);
                if (!Array.isArray(storedShops) || storedShops.length === 0) {
                    localStorage.removeItem(STORAGE_KEY);
                    return;
                }
        
                console.log(`Found ${storedShops.length} shops in localStorage. Migrating...`);
        
                db.exec("BEGIN TRANSACTION;");
                storedShops.forEach(shop => {
                    db.run("INSERT INTO shops (id, name, nextProductId) VALUES (?, ?, ?)", [shop.id, shop.name, shop.nextProductId]);
                    shop.products.forEach(p => {
                        db.run("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            [p.id, shop.id, p.description, p.descriptionTamil, p.barcode, p.b2bPrice, p.b2cPrice, p.stock, p.category]
                        );
                    });
                    shop.salesHistory.forEach(s => {
                        db.run("INSERT INTO sales_history (id, shop_id, date, subtotal, discount, tax, total, customerName, customerMobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            [s.id, shop.id, s.date, s.subtotal, s.discount, s.tax, s.total, s.customerName, s.customerMobile]
                        );
                        s.items.forEach(i => {
                            db.run("INSERT INTO sale_items (sale_id, productId, shop_id, description, descriptionTamil, quantity, price, isReturn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                [s.id, i.productId, shop.id, i.description, i.descriptionTamil, i.quantity, i.price, i.isReturn ? 1 : 0]
                            );
                        });
                    });
                });
                db.exec("COMMIT;");
                await saveDbToIndexedDB();
                
                console.log("Migration successful. Clearing old localStorage data.");
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem('pos-active-shop-id');
            } catch(e) {
                console.error("Migration failed:", e);
                db.exec("ROLLBACK;");
            }
        };

        const loadData = async () => {
            await initDb();
            const shopsCountRes = sqlResultToObjects(db.exec("SELECT COUNT(*) as count FROM shops"));
            if (shopsCountRes[0].count === 0) {
                await migrateFromLocalStorage();
            }

            const shopsFromDb = sqlResultToObjects(db.exec("SELECT * FROM shops"));

            if (shopsFromDb.length > 0) {
                const fullShopsDataPromises = shopsFromDb.map(async (shop: any) => {
                    const products = sqlResultToObjects(db.exec("SELECT * FROM products WHERE shop_id = ?", [shop.id]));
                    const salesHistoryRaw = sqlResultToObjects(db.exec("SELECT * FROM sales_history WHERE shop_id = ?", [shop.id]));
                    const salesHistoryPromises = salesHistoryRaw.map(async (sale) => {
                         const items = sqlResultToObjects(db.exec("SELECT *, CASE WHEN isReturn = 1 THEN 1 ELSE 0 END as isReturn FROM sale_items WHERE sale_id = ?", [sale.id]));
                         return {...sale, items: items.map(i => ({...i, isReturn: !!i.isReturn}))};
                    });
                    const salesHistory = await Promise.all(salesHistoryPromises);
                    return {...shop, products, salesHistory};
                });
                const fullShopsData = await Promise.all(fullShopsDataPromises);
                setShops(fullShopsData);

                const storedActiveId = localStorage.getItem(ACTIVE_SHOP_KEY);
                const activeId = storedActiveId ? parseInt(storedActiveId, 10) : shopsFromDb[0].id;
                setActiveShopId(activeId);
            } else {
                 if (isAuthenticated) { // Only show initial setup if logged in but no shops exist
                    setIsInitialSetup(true);
                }
            }
            
            const customersFromDb = sqlResultToObjects(db.exec("SELECT * FROM customers ORDER BY name"));
            setCustomers(customersFromDb);
            
            setDbLoading(false);
        };

        loadData().catch(console.error);
    }, [isAuthenticated]); // Re-run this effect if the user logs in

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
        db.run("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [newProduct.id, activeShop.id, newProduct.description, newProduct.descriptionTamil, newProduct.barcode, newProduct.b2bPrice, newProduct.b2cPrice, newProduct.stock, newProduct.category]
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
                b2bPrice = ?, b2cPrice = ?, stock = ?, category = ? 
            WHERE id = ? AND shop_id = ?`,
            [
                updatedProduct.description, updatedProduct.descriptionTamil, updatedProduct.barcode,
                updatedProduct.b2bPrice, updatedProduct.b2cPrice, updatedProduct.stock, updatedProduct.category,
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
            category: '' 
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


    const subtotal = activeCart.items.reduce((acc, item) => {
        const itemTotal = item.quantity * item.price;
        return item.isReturn ? acc - itemTotal : acc + itemTotal;
    }, 0);
    const taxAmount = (subtotal - activeCart.discount) * (activeCart.tax / 100);
    const total = subtotal - activeCart.discount + taxAmount;
    
    const resetSale = () => {
        updateActiveCart(defaultCartState);
    };

    const handleFinalizeSale = async () => {
        if (!activeShop) return;

        const saleRecord: Omit<SaleRecord, 'items'> = {
            id: `sale-${Date.now()}`,
            date: new Date().toISOString(),
            subtotal,
            discount: activeCart.discount,
            tax: taxAmount,
            total,
            customerName: activeCart.customerName,
            customerMobile: activeCart.customerMobile,
        };

        try {
            db.exec("BEGIN TRANSACTION;");

            // Upsert customer if mobile and name are provided
            if (activeCart.customerMobile && activeCart.customerName) {
                db.run(
                    "INSERT INTO customers (name, mobile) VALUES (?, ?) ON CONFLICT(mobile) DO UPDATE SET name=excluded.name",
                    [activeCart.customerName, activeCart.customerMobile]
                );
            }

            db.run("INSERT INTO sales_history (id, shop_id, date, subtotal, discount, tax, total, customerName, customerMobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                saleRecord.id, activeShop.id, saleRecord.date, saleRecord.subtotal, saleRecord.discount, saleRecord.tax, saleRecord.total, saleRecord.customerName, saleRecord.customerMobile
            ]);

            const newProductsState = [...activeShop.products];
            activeCart.items.forEach(item => {
                db.run("INSERT INTO sale_items (sale_id, productId, shop_id, description, descriptionTamil, quantity, price, isReturn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
                    saleRecord.id, item.productId, activeShop.id, item.description, item.descriptionTamil, item.quantity, item.price, item.isReturn ? 1 : 0
                ]);
                const stockChange = item.isReturn ? item.quantity : -item.quantity;
                db.run("UPDATE products SET stock = stock + ? WHERE id = ? AND shop_id = ?", [stockChange, item.productId, activeShop.id]);
                const productIndex = newProductsState.findIndex(p => p.id === item.productId);
                if (productIndex > -1) newProductsState[productIndex].stock += stockChange;
            });
            db.exec("COMMIT;");
            await saveDbToIndexedDB();

            const fullSaleRecord = { ...saleRecord, items: activeCart.items };
            const updatedShops = shops.map(s => s.id === activeShop.id ? {
                ...s,
                products: newProductsState,
                salesHistory: [...s.salesHistory, fullSaleRecord]
            } : s);
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
                db.run("INSERT INTO products (id, shop_id, description, descriptionTamil, barcode, b2bPrice, b2cPrice, stock, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [newProduct.id, activeShop.id, newProduct.description, newProduct.descriptionTamil, newProduct.barcode, newProduct.b2bPrice, newProduct.b2cPrice, newProduct.stock, newProduct.category]
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

    if (dbLoading) {
        return (
            <div style={{...styles.appContainer, justifyContent: 'center', alignItems: 'center', minHeight: '400px'}}>
                <h2>Initializing Database...</h2>
                <p>Please wait. This may take a moment on the first run.</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginView onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div style={styles.appContainer}>
            <nav style={styles.nav}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button 
                        onClick={() => setActiveView('sales')} 
                        style={activeView === 'sales' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                        disabled={!activeShop}
                    >
                        Sales
                    </button>
                    <button 
                        onClick={() => setActiveView('products')} 
                        style={activeView === 'products' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                        disabled={!activeShop}
                    >
                        Products
                    </button>
                    <button 
                        onClick={() => setActiveView('customers')} 
                        style={activeView === 'customers' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                        disabled={!activeShop}
                    >
                        Customers
                    </button>
                    <button 
                        onClick={() => setActiveView('reports')} 
                        style={activeView === 'reports' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                        disabled={!activeShop}
                    >
                        Reports
                    </button>
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
                    {activeShop && (
                        <div style={styles.activeShopDisplay}>
                            <strong>Active Shop:</strong> {activeShop.name}
                        </div>
                    )}
                    <button onClick={() => setIsShopManagerOpen(true)} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                        Shop Manager
                    </button>
                    <button onClick={handleLogout} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>
                        Logout
                    </button>
                </div>
            </nav>
            <main style={styles.mainContent}>
                {!activeShop && !isInitialSetup && <p style={styles.emptyMessage}>No shop selected. Please create or select a shop from the Shop Manager.</p>}
                {activeShop && activeView === 'sales' && 
                    <SalesView 
                        products={activeShop.products}
                        activeCart={activeCart}
                        updateActiveCart={updateActiveCart}
                        onPreview={() => setIsInvoiceModalOpen(true)}
                        total={total}
                        onShowHistory={() => setIsHistoryModalOpen(true)}
                        onSaveBackup={handleSaveBackup}
                        onRestoreBackup={handleRestoreBackup}
                        onUpdateProductPrice={handleUpdateProductPrice}
                        onAddNewProduct={handleAddNewProductFromSale}
                        isOnline={isOnline}
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
                    />
                }
                {activeShop && activeView === 'customers' &&
                    <CustomersView
                        customers={customers}
                        salesHistory={activeShop.salesHistory}
                        onAdd={() => handleOpenCustomerModal()}
                        onEdit={handleOpenCustomerModal}
                        onDelete={setCustomerToDelete}
                    />
                }
                {activeShop && activeView === 'reports' && <ReportsView salesHistory={activeShop.salesHistory} onPrint={setSaleToPrint}/>}
            </main>
            
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
            {isInvoiceModalOpen && 
                <InvoicePreviewModal 
                    sale={{items: activeCart.items, subtotal, discount: activeCart.discount, tax: taxAmount, total, date: new Date().toISOString()}} 
                    customerName={activeCart.customerName}
                    customerMobile={activeCart.customerMobile}
                    onFinalize={handleFinalizeSale}
                    onClose={() => setIsInvoiceModalOpen(false)} 
                    onPrint={() => window.print()}
                    onWhatsApp={(number) => updateActiveCart({ customerMobile: number })}
                    language={activeCart.language}
                />
            }
             {isBulkAddModalOpen &&
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
            }
            {isPdfUploadModalOpen && 
                <PdfUploadModal
                    onProcess={handleProcessPdfs}
                    onClose={() => setIsPdfUploadModalOpen(false)}
                />
            }
            {saleToPrint &&
                 <InvoicePreviewModal
                    sale={saleToPrint}
                    customerName={saleToPrint.customerName}
                    customerMobile={saleToPrint.customerMobile}
                    onClose={() => setSaleToPrint(null)}
                    onPrint={() => window.print()}
                    language={'english'}
                />
            }
            {isHistoryModalOpen && activeShop &&
                <HistoryModal
                    salesHistory={activeShop.salesHistory}
                    customerMobile={activeCart.customerMobile}
                    onClose={() => setIsHistoryModalOpen(false)}
                />
            }
            {isConfirmModalOpen && productIdsToDelete.length > 0 && (
                <ConfirmationModal 
                    message={`Are you sure you want to delete ${deletionMessage}? This action cannot be undone.`}
                    onConfirm={handleConfirmDelete}
                    onCancel={handleCancelDelete}
                />
            )}
            {customerToDelete && (
                <ConfirmationModal
                    message={`Are you sure you want to delete the customer "${customerToDelete.name}"? This action will not affect their past sales records.`}
                    onConfirm={handleConfirmDeleteCustomer}
                    onCancel={() => setCustomerToDelete(null)}
                />
            )}
            {isShopManagerOpen &&
                <ShopManagerModal
                    shops={shops}
                    activeShopId={activeShopId}
                    onSelect={handleSelectShop}
                    onCreate={handleCreateShop}
                    onClose={() => setIsShopManagerOpen(false)}
                />
            }
            {isInitialSetup &&
                <InitialSetupModal onCreate={handleCreateShop} />
            }
            {restoreProgress.visible &&
                <RestoreProgressModal percentage={restoreProgress.percentage} eta={restoreProgress.eta} message={restoreProgress.message} />
            }
        </div>
    );
};

// --- STYLES ---
const loginStyles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '100vh',
    },
    card: {
        width: '100%',
        maxWidth: '400px',
        padding: '2.5rem',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
    },
    title: {
        textAlign: 'center',
        margin: '0 0 0.5rem 0',
        color: 'var(--text-color)',
    },
    subtitle: {
        textAlign: 'center',
        margin: '0 0 2rem 0',
        color: 'var(--secondary-color)',
    },
    input: {
        width: '100%',
        padding: '0.8rem',
        marginBottom: '1rem',
        fontSize: '1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        boxSizing: 'border-box',
    },
    button: {
        width: '100%',
        padding: '0.8rem',
        fontSize: '1rem',
        fontWeight: 'bold',
        border: 'none',
        borderRadius: '6px',
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        cursor: 'pointer',
    },
    linkButton: {
        background: 'none',
        border: 'none',
        color: 'var(--primary-color)',
        cursor: 'pointer',
        textAlign: 'center',
        marginTop: '1.5rem',
        fontSize: '0.9rem',
        width: '100%',
    },
    error: {
        color: 'var(--danger-color)',
        backgroundColor: '#ffebee',
        border: '1px solid var(--danger-color)',
        borderRadius: '6px',
        padding: '0.8rem',
        textAlign: 'center',
        marginBottom: '1rem',
    }
};

const styles: { [key: string]: React.CSSProperties } = {
    appContainer: {
        width: '100%',
        maxWidth: '1400px',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
    },
    nav: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        padding: '0.5rem',
        backgroundColor: '#f8f9fa',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
    },
    navButton: {
        padding: '0.75rem 1.5rem',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: '500',
        color: 'var(--secondary-color)',
        borderRadius: '6px',
        margin: '0 0.25rem',
    },
    navButtonActive: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
    },
    billSelector: {
        display: 'inline-flex',
        marginLeft: '1rem',
        backgroundColor: 'var(--background-color)',
        borderRadius: '6px',
        padding: '3px',
        alignItems: 'center',
        border: '1px solid var(--border-color)',
    },
    billButton: {
        padding: '0.5rem 1rem',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '500',
        color: 'var(--secondary-color)',
        borderRadius: '4px',
    },
    billButtonActive: {
        backgroundColor: 'var(--surface-color)',
        color: 'var(--primary-color)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    },
    activeShopDisplay: {
        fontSize: '0.9rem',
        color: 'var(--secondary-color)',
        padding: '0.5rem 1rem',
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
    },
    mainContent: {
        padding: '1.5rem',
    },
    viewContainer: {
        display: 'flex',
        flexDirection: 'column',
    },
    viewHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
    },
    button: {
        padding: '0.6rem 1.2rem',
        border: 'none',
        borderRadius: '6px',
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '500',
    },
    input: {
        padding: '0.6rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        fontSize: '1rem',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        padding: '0.75rem',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        color: 'var(--secondary-color)',
        textTransform: 'uppercase',
        fontSize: '0.85rem'
    },
    td: {
        padding: '0.75rem',
        borderBottom: '1px solid var(--border-color)',
    },
    actionButton: {
        padding: '0.4rem 0.8rem',
        border: 'none',
        borderRadius: '4px',
        color: '#fff',
        cursor: 'pointer',
        marginRight: '0.5rem',
    },
    modalBackdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: 'var(--surface-color)',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto',
    },
    modalActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '1.5rem',
        gap: '1rem',
    },
    productForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    label: {
        fontWeight: '500',
        marginBottom: '-0.5rem',
    },
    emptyMessage: {
        textAlign: 'center',
        padding: '2rem',
        color: 'var(--secondary-color)',
    },
    searchResults: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        listStyle: 'none',
        padding: 0,
        margin: 0,
        maxHeight: '200px',
        overflowY: 'auto',
        zIndex: 10,
    },
    searchResultItem: {
        padding: '0.75rem',
        cursor: 'pointer',
    },
    highlighted: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
    },
    gridInput: {
        width: '80px',
        padding: '0.4rem',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
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
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
    },
    grandTotal: {
        marginLeft: '2rem',
    },
    customerSection: {
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
    },
    customerInput: {
        padding: '0.6rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        fontSize: '1rem',
        flex: 1,
    },
    countryCodeInput: {
        padding: '0.6rem 0.1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px 0 0 6px',
        fontSize: '1rem',
        flex: '0 0 45px',
        textAlign: 'center',
    },
    mobileNumberInput: {
        padding: '0.6rem',
        border: '1px solid var(--border-color)',
        borderLeft: 'none',
        borderRadius: '0 6px 6px 0',
        fontSize: '1rem',
        flex: 1,
    },
    reportSummary: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
    },
    summaryCard: {
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        textAlign: 'center',
        border: '1px solid var(--border-color)',
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
        backgroundColor: '#f8f9fa',
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
    },
    priceModeSelector: {
        display: 'flex',
        gap: '1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--surface-color)',
    },
    priceModeLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        cursor: 'pointer',
        fontWeight: '500',
    },
    backupSection: {
        marginTop: '2rem',
        paddingTop: '1.5rem',
        borderTop: '2px solid var(--border-color)',
        textAlign: 'center',
    },
    backupTitle: {
        marginBottom: '0.5rem',
        color: 'var(--text-color)',
    },
    backupDescription: {
        marginBottom: '1.5rem',
        color: 'var(--secondary-color)',
        maxWidth: '600px',
        margin: '0 auto 1.5rem auto',
    },
    backupActions: {
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shopListItem: {
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
    },
    shopListItemActive: {
        backgroundColor: 'var(--primary-color)',
        color: '#fff',
        fontWeight: 'bold',
    },
    marginGuide: {
        position: 'absolute',
        zIndex: 10,
        borderStyle: 'dashed',
        borderColor: 'rgba(0, 123, 255, 0.7)',
    },
    marginGuideHorizontal: {
        borderTopWidth: '2px',
        height: '0px',
        left: '5px',
        right: '5px',
        cursor: 'row-resize',
    },
    marginGuideVertical: {
        borderLeftWidth: '2px',
        width: '0px',
        top: '5px',
        bottom: '5px',
        cursor: 'col-resize',
    },
    customerViewLayout: {
        display: 'flex',
        gap: '1.5rem',
        height: '75vh',
    },
    customerListPanel: {
        flex: 1,
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
    },
    customerDetailPanel: {
        flex: 2,
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '1.5rem',
    },
    customerListItem: {
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
    },
    customerListItemActive: {
        backgroundColor: '#e0f7fa',
        borderRight: '4px solid var(--primary-color)',
    },
    customerDetailHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1rem',
    },
    purchaseHistoryItem: {
        padding: '1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        marginBottom: '1rem',
    }
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);