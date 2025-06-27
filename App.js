import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithCustomToken
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    where, 
    doc, 
    updateDoc,
    serverTimestamp,
    getDoc
} from 'firebase/firestore';
import { ArrowLeft, PlusCircle, Wrench, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Home, Handshake, Archive } from 'lucide-react';

// --- Firebase Configuration ---
// These variables are placeholders and will be provided by the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : { apiKey: "your-fallback-api-key", authDomain: "...", projectId: "..." };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'neighborhood-toolkit';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [page, setPage] = useState('dashboard'); // 'dashboard', 'myItems', 'myBorrows'
    
    // --- Firebase Initialization ---
    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        
        setAuth(authInstance);
        setDb(dbInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                // Fetch or create user profile
                const userRef = doc(dbInstance, `/artifacts/${appId}/users/${currentUser.uid}/profile`);
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) {
                    const newProfile = {
                        displayName: `Neighbor-${currentUser.uid.substring(0, 5)}`,
                        neighborhoodId: 'west-boone', // Default neighborhood
                        createdAt: serverTimestamp()
                    };
                    await addDoc(collection(dbInstance, `/artifacts/${appId}/users/${currentUser.uid}/profile`), newProfile);
                    setUserProfile(newProfile);
                } else {
                    setUserProfile(userSnap.data());
                }

            } else {
                setUser(null);
                setUserProfile(null);
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    // --- Authentication ---
    useEffect(() => {
        const authenticateUser = async () => {
            if (auth && !user) {
                try {
                    const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (initialToken) {
                        await signInWithCustomToken(auth, initialToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Authentication Error:", error);
                }
            }
        };
        authenticateUser();
    }, [auth]);


    if (!isAuthReady) {
        return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-semibold">Loading Toolkit...</div></div>;
    }

    return (
        <div className="bg-gray-50 min-h-screen font-sans">
            <Header user={user} userProfile={userProfile} setPage={setPage} page={page} />
            <main className="p-4 md:p-8 max-w-7xl mx-auto">
                {user && db ? (
                    <>
                        {page === 'dashboard' && <Dashboard db={db} user={user} userProfile={userProfile} />}
                        {page === 'myItems' && <MyItems db={db} user={user} userProfile={userProfile} />}
                        {page === 'myBorrows' && <MyBorrows db={db} user={user} userProfile={userProfile} />}
                    </>
                ) : (
                    <div className="text-center p-10 bg-white rounded-lg shadow">
                         <h2 className="text-2xl font-bold mb-4">Welcome to the Neighborhood Toolkit!</h2>
                         <p className="text-gray-600">Please wait while we connect you to your community.</p>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}

// --- Components ---

function Header({ user, userProfile, setPage, page }) {
    return (
        <header className="bg-white shadow-sm sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center py-4">
                    <div className="flex items-center space-x-2">
                        <Wrench className="h-8 w-8 text-blue-600" />
                        <h1 className="text-2xl font-bold text-gray-800">Neighborhood Toolkit</h1>
                    </div>
                    {user && userProfile && (
                        <div className="flex items-center space-x-4">
                             <span className="text-sm text-gray-500 hidden md:block">Welcome, {userProfile.displayName}</span>
                             <span className="text-xs text-gray-400 hidden md:block">(User ID: {user.uid})</span>
                        </div>
                    )}
                </div>
                {user && (
                    <nav className="flex space-x-1 border-t border-gray-200 -mb-px">
                        <button onClick={() => setPage('dashboard')} className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${page === 'dashboard' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Home className="inline-block h-4 w-4 mr-1"/>Available Items</button>
                        <button onClick={() => setPage('myItems')} className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${page === 'myItems' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Archive className="inline-block h-4 w-4 mr-1"/>My Inventory</button>
                        <button onClick={() => setPage('myBorrows')} className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${page === 'myBorrows' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Handshake className="inline-block h-4 w-4 mr-1"/>My Borrows</button>
                    </nav>
                )}
            </div>
        </header>
    );
}


function Dashboard({ db, user, userProfile }) {
    const [items, setItems] = useState([]);
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [showBorrowModal, setShowBorrowModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const neighborhoodId = userProfile?.neighborhoodId || 'west-boone';

    useEffect(() => {
        if (!db || !neighborhoodId) return;
        const q = query(collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/items`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setItems(itemsData);
        });
        return () => unsubscribe();
    }, [db, neighborhoodId]);
    
    const handleBorrowClick = (item) => {
        setSelectedItem(item);
        setShowBorrowModal(true);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Available to Borrow</h2>
                <button onClick={() => setShowAddItemModal(true)} className="flex items-center bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300 shadow">
                    <PlusCircle className="h-5 w-5 mr-2" />
                    Share an Item
                </button>
            </div>
            
            {items.length === 0 ? (
                 <p className="text-center text-gray-500 mt-10">No items have been shared in your neighborhood yet. Be the first!</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.filter(item => item.status === 'available' && item.ownerId !== user.uid).map(item => (
                        <ItemCard key={item.id} item={item} onBorrow={() => handleBorrowClick(item)} />
                    ))}
                </div>
            )}

            {showAddItemModal && <AddItemModal db={db} user={user} userProfile={userProfile} onClose={() => setShowAddItemModal(false)} />}
            {showBorrowModal && selectedItem && <BorrowModal db={db} user={user} userProfile={userProfile} item={selectedItem} onClose={() => setShowBorrowModal(false)} />}
        </div>
    );
}

function ItemCard({ item, onBorrow }) {
    const placeholderImg = `https://placehold.co/600x400/e2e8f0/4a5568?text=${encodeURIComponent(item.name)}`;
    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
            <img src={item.imageUrl || placeholderImg} onError={(e) => { e.target.onerror = null; e.target.src=placeholderImg; }} alt={item.name} className="w-full h-48 object-cover" />
            <div className="p-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-800">{item.name}</h3>
                <p className="text-gray-600 text-sm mb-3 h-10 overflow-hidden">{item.description}</p>
                <div className="text-xs text-gray-500 mb-4">
                    <p>Owner: {item.ownerName}</p>
                </div>
                 <button onClick={onBorrow} className="w-full bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition duration-300">
                    Request to Borrow
                </button>
            </div>
        </div>
    );
}


function AddItemModal({ db, user, userProfile, onClose }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [terms, setTerms] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(!name || !description) return;

        setIsSubmitting(true);
        const neighborhoodId = userProfile.neighborhoodId;
        const itemsCollection = collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/items`);

        try {
            await addDoc(itemsCollection, {
                name,
                description,
                imageUrl,
                terms,
                ownerId: user.uid,
                ownerName: userProfile.displayName,
                status: 'available', // 'available', 'borrowed'
                createdAt: serverTimestamp()
            });
            onClose();
        } catch (error) {
            console.error("Error adding item:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 w-full max-w-lg relative">
                 <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
                    <XCircle size={24}/>
                </button>
                <h2 className="text-2xl font-bold mb-6">Share a New Item</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Item Name (e.g., Power Drill)" className="w-full p-2 border rounded-md" required />
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief Description" className="w-full p-2 border rounded-md" required rows="3"></textarea>
                    <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL (optional)" className="w-full p-2 border rounded-md" />
                    <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Terms of Use (e.g., 'Return clean', optional)" className="w-full p-2 border rounded-md" rows="2"></textarea>
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{isSubmitting ? 'Sharing...' : 'Share Item'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function BorrowModal({ db, user, userProfile, item, onClose }) {
    const [borrowDate, setBorrowDate] = useState(new Date().toISOString().split('T')[0]);
    const [returnDate, setReturnDate] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!borrowDate || !returnDate) return;

        setIsSubmitting(true);
        const neighborhoodId = userProfile.neighborhoodId;
        const requestsCollection = collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/requests`);
        
        try {
            await addDoc(requestsCollection, {
                itemId: item.id,
                itemName: item.name,
                itemImageUrl: item.imageUrl || '',
                ownerId: item.ownerId,
                borrowerId: user.uid,
                borrowerName: userProfile.displayName,
                borrowDate,
                returnDate,
                message,
                status: 'pending', // 'pending', 'approved', 'declined', 'returned'
                requestedAt: serverTimestamp(),
                conditionCheckIn: '',
                conditionCheckOut: '',
            });
            onClose();
        } catch (error) {
            console.error("Error creating borrow request:", error);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 w-full max-w-lg relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
                    <XCircle size={24}/>
                </button>
                <h2 className="text-2xl font-bold mb-4">Request to Borrow</h2>
                <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg mb-6">
                    <img src={item.imageUrl || `https://placehold.co/100x100/e2e8f0/4a5568?text=${encodeURIComponent(item.name)}`} alt={item.name} className="w-16 h-16 object-cover rounded-md"/>
                    <div>
                        <h3 className="text-lg font-semibold">{item.name}</h3>
                        <p className="text-sm text-gray-500">Owner: {item.ownerName}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Borrow Date</label>
                            <input type="date" value={borrowDate} onChange={e => setBorrowDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full p-2 border rounded-md" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Return Date</label>
                            <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} min={borrowDate} className="w-full p-2 border rounded-md" required />
                        </div>
                    </div>
                    <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Message to owner (optional)" className="w-full p-2 border rounded-md" rows="3"></textarea>
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 disabled:bg-green-300">{isSubmitting ? 'Sending...' : 'Send Request'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function MyItems({ db, user, userProfile }) {
    const [myItems, setMyItems] = useState([]);
    const [requests, setRequests] = useState([]);
    const [expandedItemId, setExpandedItemId] = useState(null);
    const neighborhoodId = userProfile?.neighborhoodId || 'west-boone';

    useEffect(() => {
        if (!db || !user) return;
        const q = query(collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/items`), where("ownerId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMyItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db, user, neighborhoodId]);

    useEffect(() => {
        if (!db || !user) return;
        const q = query(collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/requests`), where("ownerId", "==", user.uid), where("status", "in", ["pending", "approved"]));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db, user, neighborhoodId]);
    
    const handleAction = async (requestId, newStatus) => {
        const requestRef = doc(db, `/artifacts/${appId}/public/data/${neighborhoodId}/requests`, requestId);
        await updateDoc(requestRef, { status: newStatus });

        // If approved, update the item's status to 'borrowed'
        if (newStatus === 'approved') {
            const requestSnap = await getDoc(requestRef);
            const requestData = requestSnap.data();
            const itemRef = doc(db, `/artifacts/${appId}/public/data/${neighborhoodId}/items`, requestData.itemId);
            await updateDoc(itemRef, { status: 'borrowed' });
        }
    };
    
    const toggleExpand = (itemId) => {
        setExpandedItemId(expandedItemId === itemId ? null : itemId);
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">My Shared Inventory</h2>
            {myItems.length === 0 ? (
                <p className="text-gray-500">You haven't shared any items yet.</p>
            ) : (
                <div className="space-y-4">
                {myItems.map(item => {
                    const itemRequests = requests.filter(r => r.itemId === item.id);
                    const isExpanded = expandedItemId === item.id;
                    return (
                        <div key={item.id} className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(item.id)}>
                                <div className="flex items-center space-x-4">
                                    <img src={item.imageUrl || `https://placehold.co/100x100/e2e8f0/4a5568?text=...`} alt={item.name} className="w-16 h-16 object-cover rounded-md"/>
                                    <div>
                                        <h3 className="font-bold text-lg">{item.name}</h3>
                                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${item.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                     {itemRequests.length > 0 && <span className="text-sm font-bold text-white bg-red-500 rounded-full h-6 w-6 flex items-center justify-center">{itemRequests.length}</span>}
                                     {isExpanded ? <ChevronUp/> : <ChevronDown/>}
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="mt-4 pt-4 border-t">
                                    <h4 className="font-semibold mb-2">Pending Requests</h4>
                                    {itemRequests.length > 0 ? (
                                        <div className="space-y-2">
                                            {itemRequests.map(req => (
                                                <div key={req.id} className="bg-gray-50 p-3 rounded-md flex justify-between items-center">
                                                    <div>
                                                        <p><span className="font-semibold">{req.borrowerName}</span> wants to borrow</p>
                                                        <p className="text-sm text-gray-500">For: {req.borrowDate} to {req.returnDate}</p>
                                                        {req.message && <p className="text-sm text-gray-600 mt-1 italic">"{req.message}"</p>}
                                                    </div>
                                                    {req.status === 'pending' &&
                                                        <div className="flex space-x-2">
                                                            <button onClick={() => handleAction(req.id, 'approved')} className="bg-green-500 text-white p-2 rounded-full hover:bg-green-600"><CheckCircle size={20}/></button>
                                                            <button onClick={() => handleAction(req.id, 'declined')} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600"><XCircle size={20}/></button>
                                                        </div>
                                                    }
                                                    {req.status === 'approved' && <span className="text-green-600 font-semibold">Approved</span>}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">No active requests for this item.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                </div>
            )}
        </div>
    );
}

function MyBorrows({ db, user, userProfile }) {
    const [myRequests, setMyRequests] = useState([]);
    const neighborhoodId = userProfile?.neighborhoodId || 'west-boone';

    useEffect(() => {
        if (!db || !user) return;
        const q = query(collection(db, `/artifacts/${appId}/public/data/${neighborhoodId}/requests`), where("borrowerId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by status, then by date
            requestsData.sort((a, b) => {
                const statusOrder = { 'approved': 1, 'pending': 2, 'returned': 3, 'declined': 4 };
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                return (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0);
            });
            setMyRequests(requestsData);
        });
        return () => unsubscribe();
    }, [db, user, neighborhoodId]);

    const handleReturn = async (request) => {
        const requestRef = doc(db, `/artifacts/${appId}/public/data/${neighborhoodId}/requests`, request.id);
        const itemRef = doc(db, `/artifacts/${appId}/public/data/${neighborhoodId}/items`, request.itemId);
        
        try {
            await updateDoc(requestRef, { status: 'returned' });
            await updateDoc(itemRef, { status: 'available' });
        } catch (error) {
            console.error("Error returning item:", error);
        }
    };

    const getStatusInfo = (status) => {
        switch(status) {
            case 'pending': return { text: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-4 w-4 text-yellow-500" /> };
            case 'approved': return { text: 'Approved', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4 text-green-500" /> };
            case 'declined': return { text: 'Declined', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-4 w-4 text-red-500" /> };
            case 'returned': return { text: 'Returned', color: 'bg-blue-100 text-blue-800', icon: <ArrowLeft className="h-4 w-4 text-blue-500" /> };
            default: return { text: 'Unknown', color: 'bg-gray-100 text-gray-800', icon: null };
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">My Borrowing Activity</h2>
            {myRequests.length === 0 ? (
                <p className="text-gray-500">You haven't requested to borrow any items yet.</p>
            ) : (
                <div className="space-y-3">
                    {myRequests.map(req => {
                        const statusInfo = getStatusInfo(req.status);
                        return (
                            <div key={req.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                     <img src={req.itemImageUrl || `https://placehold.co/100x100/e2e8f0/4a5568?text=...`} alt={req.itemName} className="w-16 h-16 object-cover rounded-md"/>
                                     <div>
                                        <h3 className="font-bold text-lg">{req.itemName}</h3>
                                        <p className="text-sm text-gray-500">Requested: {new Date(req.requestedAt?.seconds * 1000).toLocaleDateString()}</p>
                                        <div className={`mt-2 inline-flex items-center text-sm font-medium px-2.5 py-0.5 rounded-full ${statusInfo.color}`}>
                                            {statusInfo.icon}
                                            <span className="ml-1.5">{statusInfo.text}</span>
                                        </div>
                                     </div>
                                </div>
                                {req.status === 'approved' && (
                                    <button onClick={() => handleReturn(req)} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">Mark as Returned</button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}

function Footer() {
    return (
        <footer className="bg-white mt-12">
            <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
                <p>&copy; {new Date().getFullYear()} The Neighborhood Toolkit. A Community Project.</p>
                <p>Building local resilience, one shared item at a time.</p>
            </div>
        </footer>
    );
}
