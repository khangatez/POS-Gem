import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPE DEFINITIONS ---
interface SaleItem {
  id: number;
  productId: number;
  description: string;
  quantity: number;
  price: number;
  isReturn: boolean;
}

interface Product {
  id: number;
  description: string;
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

// --- DUMMY DATA ---
const initialProducts: Product[] = [
  { id: 1, description: 'Organic Apples', barcode: '1001', b2bPrice: 1.50, b2cPrice: 1.99, stock: 150, category: 'Fruits' },
  { id: 2, description: 'Whole Wheat Bread', barcode: '1002', b2bPrice: 2.80, b2cPrice: 3.49, stock: 8, category: 'Bakery' },
  { id: 3, description: 'Almond Milk (1L)', barcode: '1003', b2bPrice: 3.00, b2cPrice: 3.99, stock: 120, category: 'Dairy' },
  { id: 4, description: 'Free-Range Eggs (Dozen)', barcode: '1004', b2bPrice: 4.20, b2cPrice: 5.50, stock: 5, category: 'Dairy' },
  { id: 5, description: 'Avocado', barcode: '1005', b2bPrice: 1.10, b2cPrice: 1.75, stock: 250, category: 'Fruits' },
];

// --- PRODUCT FORM MODAL COMPONENT ---
const ProductFormModal = ({ product, onSave, onClose, onUpdate }: { product: Product | null, onSave: (product: Omit<Product, 'id'>) => void, onUpdate: (product: Product) => void, onClose: () => void }) => {
    type ProductFormData = Omit<Product, 'id' | 'b2bPrice' | 'b2cPrice' | 'stock'> & {
        b2bPrice: string | number;
        b2cPrice: string | number;
        stock: string | number;
    };
    
    const [formData, setFormData] = useState<ProductFormData>(
        product 
        ? { ...product, category: product.category || '' }
        : { description: '', barcode: '', b2bPrice: '', b2cPrice: '', stock: '', category: '' }
    );
    
    const descriptionRef = useRef<HTMLInputElement>(null);
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
                <h3 id="confirmation-dialog-title" style={{marginTop: 0, color: 'var(--danger-color)'}}>Confirm Deletion</h3>
                <p>{message}</p>
                <div style={styles.modalActions}>
                    <button ref={cancelBtnRef} onClick={onCancel} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>Cancel</button>
                    <button onClick={onConfirm} style={{...styles.button, backgroundColor: 'var(--danger-color)'}}>Confirm Delete</button>
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


// --- BULK ADD PRODUCTS MODAL ---
type EditableProduct = Omit<Product, 'id'>;

const BulkAddModal = ({ imageSrc, initialProducts, onSave, onClose, loading, error }: {
    imageSrc: string;
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
             product[field] = value as string;
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
                <div style={{ flex: 1 }}>
                    <h3 style={{marginTop: 0}}>Uploaded Image</h3>
                    <img src={imageSrc} alt="Uploaded inventory" style={{ width: '100%', borderRadius: '8px', objectFit: 'contain', maxHeight: '70vh' }} />
                </div>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{marginTop: 0}}>Extracted Products (Editable)</h3>
                    {loading && <p>Analyzing image with AI... Please wait.</p>}
                    {error && <p style={{ color: 'var(--danger-color)' }}>Error: {error}</p>}
                    {!loading && !error && (
                        <>
                            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                <table style={{ ...styles.table, tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{...styles.th, width: '25%'}}>Description</th>
                                            <th style={{...styles.th, width: '15%'}}>Category</th>
                                            <th style={{...styles.th, width: '15%'}}>B2B Price</th>
                                            <th style={{...styles.th, width: '15%'}}>B2C Price</th>
                                            <th style={{...styles.th, width: '12%'}}>Stock</th>
                                            <th style={{...styles.th, width: '18%'}}>Barcode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map((p, index) => (
                                            <tr key={index}>
                                                <td style={styles.td}><input type="text" value={p.description} onChange={(e) => handleProductChange(index, 'description', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
                                                <td style={styles.td}><input type="text" value={p.category} onChange={(e) => handleProductChange(index, 'category', e.target.value)} style={{...styles.gridInput, width: '95%'}} /></td>
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
const ProductsView = ({ products, onEdit, onDelete, onAdd, onBulkAdd }) => {
    const [filter, setFilter] = useState<'all' | 'low'>('all');
    const bulkAddInputRef = useRef<HTMLInputElement>(null);

    const lowStockThreshold = 10;
    const filteredProducts = filter === 'low' 
        ? products.filter(p => p.stock <= lowStockThreshold)
        : products;
        
    const handleBulkAddClick = () => {
        bulkAddInputRef.current?.click();
    };

    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Product Inventory</h2>
                <div>
                     <button onClick={() => setFilter(filter === 'all' ? 'low' : 'all')} style={{...styles.button, marginRight: '1rem', backgroundColor: 'var(--secondary-color)'}}>
                        {filter === 'all' ? 'Show Low Stock' : 'Show All Products'}
                    </button>
                    <input
                        type="file"
                        accept="image/*"
                        ref={bulkAddInputRef}
                        onChange={onBulkAdd}
                        style={{ display: 'none' }}
                    />
                     <button onClick={handleBulkAddClick} style={{...styles.button, marginRight: '1rem', backgroundColor: '#ffc107', color: 'black'}}>Bulk Add from Image</button>
                    <button onClick={onAdd} style={styles.button}>Add New Product</button>
                </div>
            </div>
            {filteredProducts.length > 0 ? (
                 <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Description</th>
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
                                <td style={styles.td}>{p.description}</td>
                                <td style={styles.td}>{p.category || 'N/A'}</td>
                                <td style={styles.td}>{p.barcode}</td>
                                <td style={styles.td}>₹{p.b2bPrice.toFixed(2)}</td>
                                <td style={styles.td}>₹{p.b2cPrice.toFixed(2)}</td>
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
                    {filter === 'low' ? 'No low stock products found.' : 'No products found. Add a new product to get started.'}
                </p>
            )}
        </div>
    );
};

// --- INVOICE PREVIEW MODAL ---
const InvoicePreviewModal = ({ sale, customerName, customerMobile, onFinalize, onClose, onPrint, onWhatsApp }: {
    sale: any;
    customerName?: string;
    customerMobile?: string;
    onFinalize?: () => void;
    onClose?: () => void;
    onPrint?: () => void;
    onWhatsApp?: (number: string) => void;
}) => {
    const [phoneNumber, setPhoneNumber] = useState(customerMobile || '');
    const modalContentRef = useRef(null);

    const purchasedItems = sale.items.filter(item => !item.isReturn);
    const returnedItems = sale.items.filter(item => item.isReturn);

    const grossTotal = purchasedItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const returnTotal = returnedItems.reduce((acc, item) => acc + item.quantity * item.price, 0);

    const saleDate = onFinalize ? new Date() : new Date(sale.date);

    const handleWhatsAppClick = () => {
        if (!phoneNumber) {
            alert('Please enter a customer phone number.');
            return;
        }
        if (!onWhatsApp) return;

        const purchasedItemsText = purchasedItems.length > 0
            ? '--- Purchased Items ---\n' + purchasedItems.map(item =>
                `${item.description} (Qty: ${item.quantity} x ₹${item.price.toFixed(2)} = ₹${(item.quantity * item.price).toFixed(2)})`
            ).join('\n')
            : '';
        
        const returnedItemsText = returnedItems.length > 0
            ? '\n--- Returned Items ---\n' + returnedItems.map(item =>
                `${item.description} (Qty: ${item.quantity} x ₹${item.price.toFixed(2)} = ₹${(item.quantity * item.price).toFixed(2)})`
            ).join('\n')
            : '';

        const message = `
Hello ${customerName || 'Valued Customer'},

Here is your invoice summary:
${purchasedItemsText}
${returnedItemsText}
-----------------------------------
Gross Total: ₹${grossTotal.toFixed(2)}
${returnTotal > 0 ? `Total Returns: -₹${returnTotal.toFixed(2)}` : ''}
-----------------------------------
Subtotal: ₹${sale.subtotal.toFixed(2)}
${sale.discount > 0 ? `Discount: -₹${sale.discount.toFixed(2)}` : ''}
${sale.tax > 0 ? `Tax: ₹${sale.tax.toFixed(2)}` : ''}
Grand Total: ₹${sale.total.toFixed(2)}
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
            <h4 style={{ margin: '0.8rem 0 0.4rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>{title}</h4>
            <table style={{...styles.table, fontSize: '10pt', width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                    <tr>
                        <th style={{...styles.th, textAlign: 'left', padding: '2px', width: '30px'}}>S.No.</th>
                        <th style={{...styles.th, textAlign: 'left', padding: '2px'}}>Item</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Qty</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Price</th>
                        <th style={{...styles.th, textAlign: 'right', padding: '2px'}}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={item.id} style={isReturn ? {color: 'var(--danger-color)'} : {}}>
                            <td style={{...styles.td, padding: '2px', textAlign: 'center'}}>{index + 1}</td>
                            <td style={{...styles.td, padding: '2px'}}>{item.description}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.quantity}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{item.price.toFixed(2)}</td>
                            <td style={{...styles.td, textAlign: 'right', padding: '2px'}}>{(item.quantity * item.price).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );

    return (
        <div className="invoice-preview-backdrop" style={styles.modalBackdrop}>
            <div ref={modalContentRef} className="invoice-preview-content" style={{...styles.modalContent, maxWidth: '4in', padding: '0.5rem'}}>
                <div style={{textAlign: 'center', marginBottom: '1rem'}}>
                    <h2 style={{margin: '0'}}>Invoice</h2>
                    <p style={{margin: '0'}}>Date: {saleDate.toLocaleString()}</p>
                </div>

                {customerName && <p style={{margin: '0.2rem 0'}}><b>Customer:</b> {customerName}</p>}
                {customerMobile && <p style={{margin: '0.2rem 0'}}><b>Mobile:</b> {customerMobile}</p>}

                {purchasedItems.length > 0 && renderTable(purchasedItems, 'Purchased Items')}
                {returnedItems.length > 0 && renderTable(returnedItems, 'Returned Items', true)}

                <hr style={{border: '1px dashed #ccc', margin: '0.5rem 0'}}/>

                <div style={{textAlign: 'right', fontSize: '10pt'}}>
                    {purchasedItems.length > 0 && <p style={{margin: '2px 0'}}><b>Gross Total:</b> ₹{grossTotal.toFixed(2)}</p>}
                    {returnedItems.length > 0 && <p style={{margin: '2px 0', color: 'var(--danger-color)'}}><b>Total Returns:</b> -₹{returnTotal.toFixed(2)}</p>}
                    <p style={{margin: '2px 0'}}><b>Subtotal:</b> ₹{sale.subtotal.toFixed(2)}</p>
                    {sale.discount > 0 && <p style={{margin: '2px 0'}}><b>Discount:</b> -₹{sale.discount.toFixed(2)}</p>}
                    {sale.tax > 0 && <p style={{margin: '2px 0'}}><b>Tax:</b> ₹{sale.tax.toFixed(2)}</p>}
                    <p style={{margin: '2px 0', fontSize: '12pt'}}><b>Grand Total:</b> ₹{sale.total.toFixed(2)}</p>
                </div>

                <p style={{textAlign: 'center', fontSize: '9pt', marginTop: '1rem'}}>
                    Goods once sold cannot be taken back.
                </p>

                <div className="invoice-actions" style={{...styles.modalActions, marginTop: '1.5rem', flexWrap: 'wrap'}}>
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
                                <h4>Date: {new Date(sale.date).toLocaleString()} (Total: ₹{sale.total.toFixed(2)})</h4>
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
                                        {sale.items.map(item => (
                                            <tr key={item.id}>
                                                <td style={styles.td}>{item.description} {item.isReturn && '(Return)'}</td>
                                                <td style={styles.td}>{item.quantity}</td>
                                                <td style={styles.td}>₹{item.price.toFixed(2)}</td>
                                                <td style={styles.td}>₹{(item.price * item.quantity).toFixed(2)}</td>
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
    const today = new Date().toLocaleDateString();
    const todaysSales = salesHistory.filter(sale => new Date(sale.date).toLocaleDateString() === today);

    const totalRevenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalItemsSold = todaysSales.reduce((sum, sale) => sum + sale.items.filter(i => !i.isReturn).length, 0);
    const totalTransactions = todaysSales.length;

    const [expandedSale, setExpandedSale] = useState<string | null>(null);
    
    return (
        <div style={styles.viewContainer}>
            <div style={styles.viewHeader}>
                <h2>Daily Sales Report for {today}</h2>
            </div>
            <div style={styles.reportSummary}>
                 <div style={styles.summaryCard}><h3>Total Revenue</h3><p>₹{totalRevenue.toFixed(2)}</p></div>
                 <div style={styles.summaryCard}><h3>Items Sold</h3><p>{totalItemsSold}</p></div>
                 <div style={styles.summaryCard}><h3>Transactions</h3><p>{totalTransactions}</p></div>
            </div>
            <h3>Transactions</h3>
            {todaysSales.length > 0 ? (
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
                        {todaysSales.map(sale => (
                            <React.Fragment key={sale.id}>
                                <tr>
                                    <td style={styles.td}>{new Date(sale.date).toLocaleTimeString()}</td>
                                    <td style={styles.td}>{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td>
                                    <td style={styles.td}>{sale.items.length}</td>
                                    <td style={styles.td}>₹{sale.total.toFixed(2)}</td>
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
                                                    {sale.items.map(item => (
                                                        <tr key={item.id}>
                                                            <td style={styles.td}>{item.description}</td>
                                                            <td style={styles.td}>{item.quantity}</td>
                                                            <td style={styles.td}>₹{item.price.toFixed(2)}</td>
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
            ) : (
                <p style={styles.emptyMessage}>No sales recorded today.</p>
            )}
        </div>
    );
};

// --- ICON COMPONENTS ---
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
    saleItems, 
    setSaleItems, 
    onPreview, 
    subtotal, 
    discount, 
    setDiscount, 
    tax, 
    setTax, 
    total,
    customerName,
    setCustomerName,
    customerMobile,
    setCustomerMobile,
    onShowHistory,
    onSaveBackup,
    onRestoreBackup,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [priceMode, setPriceMode] = useState<'b2b' | 'b2c'>('b2c');
    const [isListening, setIsListening] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [countryCode, setCountryCode] = useState('+91');
    const [mobileNumber, setMobileNumber] = useState('');

    const customerNameRef = useRef<HTMLInputElement>(null);
    const customerMobileRef = useRef<HTMLInputElement>(null);
    const productSearchRef = useRef<HTMLInputElement>(null);
    const quantityInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        customerNameRef.current?.focus();
    }, []);
    
    // Effect to update parent when local mobile number changes
    useEffect(() => {
        setCustomerMobile(countryCode + mobileNumber);
    }, [countryCode, mobileNumber, setCustomerMobile]);

    // Effect to reset local state when parent prop is cleared
    useEffect(() => {
        if (customerMobile === '') {
            setCountryCode('+91');
            setMobileNumber('');
        }
    }, [customerMobile]);

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
                products.filter(p => p.description.toLowerCase().includes(term.toLowerCase()) || p.barcode.includes(term))
            );
        } else {
            setSearchResults([]);
            setHighlightedIndex(-1);
        }
    };
    
    const handleAddToSale = (product: Product, focusOnQuantity: boolean = true) => {
        const price = priceMode === 'b2b' ? product.b2bPrice : product.b2cPrice;
        
        const existingItemIndex = saleItems.findIndex(item => item.productId === product.id && !item.isReturn);
        if (existingItemIndex > -1) {
            const updatedItems = [...saleItems];
            updatedItems[existingItemIndex].quantity += 1;
            setSaleItems(updatedItems);
        } else {
            const newItem: SaleItem = {
                id: Date.now(),
                productId: product.id,
                description: product.description,
                quantity: 1,
                price: price,
                isReturn: false,
            };
            setSaleItems(prev => [...prev, newItem]);
        }
        setSearchTerm('');
        setSearchResults([]);
        setHighlightedIndex(-1);
        
        if (focusOnQuantity) {
            setTimeout(() => {
                const newItemId = saleItems.length;
                const inputRef = quantityInputRefs.current[newItemId];
                inputRef?.focus();
                inputRef?.select();
            }, 100);
        }
    };

    const handleUpdateSaleItem = (id: number, field: keyof SaleItem, value: any) => {
        setSaleItems(
            saleItems.map(item => item.id === id ? { ...item, [field]: value } : item)
        );
    };
    
    const handleRemoveSaleItem = (id: number) => {
        setSaleItems(saleItems.filter(item => item.id !== id));
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (searchResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev + 1) % searchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex > -1) {
                handleAddToSale(searchResults[highlightedIndex]);
            } else if (searchResults.length > 0) {
                 handleAddToSale(searchResults[0]);
            }
        }
    };

    const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            productSearchRef.current?.focus();
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
            setSearchTerm(speechResult);
            // Manually trigger search results update
             setSearchResults(
                products.filter(p => p.description.toLowerCase().includes(speechResult.toLowerCase()) || p.barcode.includes(speechResult))
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
                    <button onClick={onPreview} style={styles.button} disabled={saleItems.length === 0}>Preview Invoice</button>
                </div>
            </div>
            
            <div style={styles.customerSection}>
                 <input 
                    ref={customerNameRef}
                    type="text" 
                    value={customerName} 
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    style={styles.customerInput}
                    onKeyDown={(e) => handleCustomerKeyDown(e, 'mobile')}
                 />
                 <div style={{ display: 'flex', flex: 1.5 }}>
                    <input
                        type="text"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        placeholder="+91"
                        style={styles.countryCodeInput}
                    />
                    <input 
                        ref={customerMobileRef}
                        type="tel" 
                        value={mobileNumber} 
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="Customer Mobile"
                        style={styles.mobileNumberInput}
                        onKeyDown={(e) => handleCustomerKeyDown(e, 'product')}
                    />
                 </div>
                 <button onClick={onShowHistory} style={{...styles.button, marginLeft: '0.5rem'}} disabled={!customerMobile}>History</button>
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
                 <button onClick={handleVoiceSearch} style={styles.voiceSearchButton} title="Search with voice">
                    <MicIcon color={isListening ? 'var(--danger-color)' : 'var(--secondary-color)'} />
                </button>
                {searchResults.length > 0 && (
                    <ul style={styles.searchResults}>
                        {searchResults.map((p, index) => (
                            <li
                                key={p.id}
                                onClick={() => handleAddToSale(p)}
                                style={index === highlightedIndex ? {...styles.searchResultItem, ...styles.highlighted} : styles.searchResultItem}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {/* FIX: Corrected typo from c2cPrice to b2cPrice */}
                                {p.description} (₹{(priceMode === 'b2b' ? p.b2bPrice : p.b2cPrice).toFixed(2)}) - Stock: {p.stock}
                            </li>
                        ))}
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
                        {saleItems.map((item, index) => {
                            const itemTotal = item.quantity * item.price;
                            return (
                                <tr key={item.id} style={item.isReturn ? {backgroundColor: '#ffebee'} : {}}>
                                    <td style={styles.td}>{index + 1}</td>
                                    <td style={styles.td}>{item.description}</td>
                                    <td style={styles.td}>
                                        <input
                                            ref={el => { quantityInputRefs.current[index] = el; }}
                                            type="number"
                                            step="0.001"
                                            value={item.quantity}
                                            onChange={(e) => handleUpdateSaleItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                            style={styles.gridInput}
                                            onKeyDown={handleQuantityKeyDown}
                                        />
                                    </td>
                                    <td style={styles.td}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={item.price}
                                            onChange={(e) => handleUpdateSaleItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                                            style={styles.gridInput}
                                            onKeyDown={handlePriceKeyDown}
                                        />
                                    </td>
                                    <td style={styles.td}>₹{itemTotal.toFixed(2)}</td>
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
                 {saleItems.length === 0 && <p style={styles.emptyMessage}>No items in sale.</p>}
            </div>

            <div style={styles.totalsSection}>
                <div>
                    <label>Discount (₹)</label>
                    <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={styles.totalsInput}/>
                </div>
                <div>
                    <label>Tax (%)</label>
                    <input type="number" step="0.01" value={tax} onChange={(e) => setTax(parseFloat(e.target.value) || 0)} style={styles.totalsInput}/>
                </div>
                <div style={styles.grandTotal}>
                    <h3>Grand Total: ₹{total.toFixed(2)}</h3>
                </div>
            </div>
            
            <div style={styles.backupSection}>
                <h3 style={styles.backupTitle}>Backup & Restore</h3>
                <p style={styles.backupDescription}>
                    Save all your product and sales data to a file on your computer, or restore it from a previous backup.
                </p>
                <div style={styles.backupActions}>
                    <button onClick={onSaveBackup} style={{...styles.button, backgroundColor: 'var(--secondary-color)'}}>
                        Save Backup to Disk
                    </button>
                    <label style={{...styles.button, backgroundColor: 'var(--success-color)', cursor: 'pointer'}}>
                        Load Backup from Disk
                        <input
                            type="file"
                            accept=".json"
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


// --- MAIN APP COMPONENT ---
const App = () => {
    const [activeView, setActiveView] = useState('sales');
    const [products, setProducts] = useState<Product[]>([]);
    const [nextProductId, setNextProductId] = useState(1);
    
    const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
    const [discount, setDiscount] = useState(0);
    const [tax, setTax] = useState(0);
    
    const [customerName, setCustomerName] = useState('');
    const [customerMobile, setCustomerMobile] = useState('');

    const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [saleToPrint, setSaleToPrint] = useState<SaleRecord | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [productToDeleteId, setProductToDeleteId] = useState<number | null>(null);
    const [currentDateTime, setCurrentDateTime] = useState(new Date());
    
    // State for Bulk Add Modal
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [bulkAddImage, setBulkAddImage] = useState<string | null>(null);
    const [bulkAddProducts, setBulkAddProducts] = useState<EditableProduct[]>([]);
    const [isBulkAddLoading, setIsBulkAddLoading] = useState(false);
    const [bulkAddError, setBulkAddError] = useState<string | null>(null);


    useEffect(() => {
        const timerId = setInterval(() => setCurrentDateTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    
    // Load data from localStorage on initial render
    useEffect(() => {
        try {
            // Load products
            let loadedProducts: Product[] = initialProducts;
            const storedProducts = localStorage.getItem('pos-products');
            if (storedProducts) {
                const parsedProducts = JSON.parse(storedProducts);
                // Ensure the loaded data is an array before using it to prevent data corruption
                if (Array.isArray(parsedProducts)) {
                    loadedProducts = parsedProducts;
                } else {
                    console.warn("Stored product data is not an array. Falling back to initial data.");
                }
            }
            setProducts(loadedProducts);
            
            // This ensures new product IDs don't conflict with loaded ones
            const maxId = loadedProducts.reduce((max, p) => Math.max(max, p.id), 0);
            setNextProductId(maxId + 1);

            // Load sales history
            const storedSales = localStorage.getItem('pos-sales-history');
            if (storedSales) {
                const parsedSales = JSON.parse(storedSales);
                if (Array.isArray(parsedSales)) {
                    setSalesHistory(parsedSales);
                } else {
                    console.warn("Stored sales history data is not an array. Ignoring.");
                }
            }
        } catch (error) {
            console.error("Failed to load data from localStorage:", error);
            // On any critical error, reset to a known good state
            setProducts(initialProducts);
            const maxId = initialProducts.reduce((max, p) => Math.max(max, p.id), 0);
            setNextProductId(maxId + 1);
            setSalesHistory([]);
        }
    }, []);

    // Save products to localStorage whenever they change
    const saveProducts = (updatedProducts: Product[]) => {
        try {
            localStorage.setItem('pos-products', JSON.stringify(updatedProducts));
            setProducts(updatedProducts);
        } catch (error) {
            console.error("Failed to save products:", error);
        }
    };

    // Save sales history to localStorage
    const saveSalesHistory = (updatedHistory: SaleRecord[]) => {
        try {
            localStorage.setItem('pos-sales-history', JSON.stringify(updatedHistory));
            setSalesHistory(updatedHistory);
        } catch (error) {
            console.error("Failed to save sales history:", error);
        }
    };
    
    const handleSaveProduct = (productData: Omit<Product, 'id'>) => {
        const newProduct = { ...productData, id: nextProductId };
        const updatedProducts = [...products, newProduct];
        saveProducts(updatedProducts);
        setNextProductId(prev => prev + 1);
        setIsProductModalOpen(false);
    };

    const handleUpdateProduct = (updatedProduct: Product) => {
        const updatedProducts = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
        saveProducts(updatedProducts);
        setIsProductModalOpen(false);
        setEditingProduct(null);
    };
    
    const handleDeleteRequest = (id: number) => {
        setProductToDeleteId(id);
        setIsConfirmModalOpen(true);
    };
    
    const handleConfirmDelete = () => {
        if (productToDeleteId === null) return;
        const updatedProducts = products.filter(p => p.id !== productToDeleteId);
        saveProducts(updatedProducts);
        setProductToDeleteId(null);
        setIsConfirmModalOpen(false);
    };

    const handleCancelDelete = () => {
        setProductToDeleteId(null);
        setIsConfirmModalOpen(false);
    };

    const handleOpenProductModal = (product: Product | null = null) => {
        setEditingProduct(product);
        setIsProductModalOpen(true);
    };

    const subtotal = saleItems.reduce((acc, item) => {
        const itemTotal = item.quantity * item.price;
        return item.isReturn ? acc - itemTotal : acc + itemTotal;
    }, 0);
    const taxAmount = (subtotal - discount) * (tax / 100);
    const total = subtotal - discount + taxAmount;
    
    const resetSale = () => {
        setSaleItems([]);
        setDiscount(0);
        setTax(0);
        setCustomerName('');
        setCustomerMobile('');
    };

    const handleFinalizeSale = () => {
        const saleRecord: SaleRecord = {
            id: `sale-${Date.now()}`,
            date: new Date().toISOString(),
            items: saleItems,
            subtotal,
            discount,
            tax: taxAmount,
            total,
            customerName,
            customerMobile,
        };

        const updatedHistory = [...salesHistory, saleRecord];
        saveSalesHistory(updatedHistory);

        // Update stock
        const updatedProducts = [...products];
        saleItems.forEach(item => {
            const productIndex = updatedProducts.findIndex(p => p.id === item.productId);
            if (productIndex > -1) {
                if (item.isReturn) {
                    updatedProducts[productIndex].stock += item.quantity;
                } else {
                    updatedProducts[productIndex].stock -= item.quantity;
                }
            }
        });
        saveProducts(updatedProducts);

        resetSale();
        setIsInvoiceModalOpen(false);
    };
    
    const handleSaveBackup = () => {
        try {
            const backupData = {
                products: products,
                salesHistory: salesHistory,
            };
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `pos_backup_${date}.json`;
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
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error("File content is not readable text.");
                }
                const data = JSON.parse(text);

                // Basic validation
                if (!Array.isArray(data.products) || !Array.isArray(data.salesHistory)) {
                    throw new Error("Invalid backup file format. Missing 'products' or 'salesHistory' arrays.");
                }

                if (window.confirm("Are you sure you want to restore this backup? All current data will be overwritten.")) {
                    saveProducts(data.products);
                    saveSalesHistory(data.salesHistory);

                    const maxId = data.products.reduce((max: number, p: Product) => Math.max(max, p.id), 0);
                    setNextProductId(maxId + 1);

                    alert("Backup restored successfully!");
                }
            } catch (error: any) {
                console.error("Failed to restore backup:", error);
                alert(`Error: Could not restore backup. Please ensure you selected a valid backup file. Details: ${error.message}`);
            } finally {
                event.target.value = '';
            }
        };
        reader.onerror = () => {
            alert("Error reading the file.");
            event.target.value = '';
        };
        reader.readAsText(file);
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
                text: "Analyze the products in this image. Extract the product description and a suitable category for each item. Do not invent prices, stock levels, or barcodes. Return the data as a JSON array.",
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
            
            const jsonStr = response.text.trim();
            const parsedProducts = JSON.parse(jsonStr);

            if (Array.isArray(parsedProducts)) {
                 const editableProducts: EditableProduct[] = parsedProducts.map(p => ({
                    description: p.description || '',
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

    const handleFileSelectForBulkAdd = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setBulkAddImage(result);
            setIsBulkAddModalOpen(true);
            const base64String = result.split(',')[1];
            processImageForProducts(base64String, file.type);
        };
        reader.readAsDataURL(file);
        event.target.value = ''; // Reset input to allow re-selection of the same file
    };

    const handleSaveBulkProducts = (newProducts: EditableProduct[]) => {
        let currentId = nextProductId;
        const productsToAdd = newProducts.map(p => ({ ...p, id: currentId++ }));
        
        const updatedProducts = [...products, ...productsToAdd];
        saveProducts(updatedProducts);
        setNextProductId(currentId);
        
        // Close and reset modal state
        setIsBulkAddModalOpen(false);
        setBulkAddImage(null);
        setBulkAddProducts([]);
        setBulkAddError(null);
    };

    const productForDeletion = productToDeleteId ? products.find(p => p.id === productToDeleteId) : null;

    return (
        <div style={styles.appContainer}>
            <nav style={styles.nav}>
                <div>
                    <button 
                        onClick={() => setActiveView('sales')} 
                        style={activeView === 'sales' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                    >
                        Sales
                    </button>
                    <button 
                        onClick={() => setActiveView('products')} 
                        style={activeView === 'products' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                    >
                        Products
                    </button>
                    <button 
                        onClick={() => setActiveView('reports')} 
                        style={activeView === 'reports' ? {...styles.navButton, ...styles.navButtonActive} : styles.navButton}
                    >
                        Reports
                    </button>
                </div>
                <div style={styles.dateTimeDisplay}>
                    {currentDateTime.toLocaleString('en-US', {
                        dateStyle: 'long',
                        timeStyle: 'medium',
                        hour12: true,
                    })}
                </div>
            </nav>
            <main style={styles.mainContent}>
                {activeView === 'sales' && 
                    <SalesView 
                        products={products}
                        saleItems={saleItems}
                        setSaleItems={setSaleItems}
                        onPreview={() => setIsInvoiceModalOpen(true)}
                        subtotal={subtotal}
                        discount={discount}
                        setDiscount={setDiscount}
                        tax={tax}
                        setTax={setTax}
                        total={total}
                        customerName={customerName}
                        setCustomerName={setCustomerName}
                        customerMobile={customerMobile}
                        setCustomerMobile={setCustomerMobile}
                        onShowHistory={() => setIsHistoryModalOpen(true)}
                        onSaveBackup={handleSaveBackup}
                        onRestoreBackup={handleRestoreBackup}
                    />
                }
                {activeView === 'products' && 
                    <ProductsView 
                        products={products}
                        onAdd={() => handleOpenProductModal()}
                        onEdit={handleOpenProductModal}
                        onDelete={handleDeleteRequest}
                        onBulkAdd={handleFileSelectForBulkAdd}
                    />
                }
                {activeView === 'reports' && <ReportsView salesHistory={salesHistory} onPrint={setSaleToPrint}/>}
            </main>
            
            {isProductModalOpen && 
                <ProductFormModal 
                    product={editingProduct} 
                    onSave={handleSaveProduct}
                    onUpdate={handleUpdateProduct}
                    onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }} 
                />
            }
            {isInvoiceModalOpen && 
                <InvoicePreviewModal 
                    sale={{items: saleItems, subtotal, discount, tax: taxAmount, total, date: new Date().toISOString()}} 
                    customerName={customerName}
                    customerMobile={customerMobile}
                    onFinalize={handleFinalizeSale}
                    onClose={() => setIsInvoiceModalOpen(false)} 
                    onPrint={() => window.print()}
                    onWhatsApp={(number) => setCustomerMobile(number)}
                />
            }
             {isBulkAddModalOpen && bulkAddImage &&
                <BulkAddModal
                    imageSrc={bulkAddImage}
                    initialProducts={bulkAddProducts}
                    onSave={handleSaveBulkProducts}
                    onClose={() => setIsBulkAddModalOpen(false)}
                    loading={isBulkAddLoading}
                    error={bulkAddError}
                />
            }
            {saleToPrint &&
                 <InvoicePreviewModal
                    sale={saleToPrint}
                    customerName={saleToPrint.customerName}
                    customerMobile={saleToPrint.customerMobile}
                    onClose={() => setSaleToPrint(null)}
                    onPrint={() => window.print()}
                />
            }
            {isHistoryModalOpen &&
                <HistoryModal
                    salesHistory={salesHistory}
                    customerMobile={customerMobile}
                    onClose={() => setIsHistoryModalOpen(false)}
                />
            }
            {isConfirmModalOpen && productForDeletion && (
                <ConfirmationModal 
                    message={`Are you sure you want to delete the product "${productForDeletion.description}"? This action cannot be undone.`}
                    onConfirm={handleConfirmDelete}
                    onCancel={handleCancelDelete}
                />
            )}
        </div>
    );
};

// --- STYLES ---
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
    dateTimeDisplay: {
        fontSize: '0.9rem',
        fontWeight: '500',
        color: 'var(--secondary-color)',
        paddingRight: '1rem',
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
        flex: '0 0 25px',
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
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);