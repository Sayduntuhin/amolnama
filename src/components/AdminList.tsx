import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Mail, Shield, User, Loader2, Search, X, Edit } from 'lucide-react';
import { adminService } from '@/src/services/adminService';
import { cn } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';
import { motion, AnimatePresence } from 'motion/react';

export function AdminList() {
  const { showSuccess, showError } = useSnackbar();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAdminToEdit, setSelectedAdminToEdit] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAllAdmins();
      setAdmins(data || []);
    } catch (error) {
      console.error("Admin roster load failure:", error);
      showError("Failed to retrieve administrator roster.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (id: string, email: string) => {
    const emailLower = email.toLowerCase().trim();
    if (
      emailLower === 'sayduntuhin.jvai@gmail.com' || 
      emailLower === 'exceptionhubjvai@gmail.com'
    ) {
      showError("CRITICAL EXCEPTION: Seed administrator accounts cannot be deleted.");
      return;
    }

    if (window.confirm(`CRITICAL: Permanently revoke administrator privileges for ${email}?`)) {
      const previousAdmins = [...admins];
      // Optimistic UI update
      setAdmins(prev => prev.filter(a => a.id !== id));
      showSuccess('Administrator privileges revoked.');

      try {
        await adminService.deleteAdmin(id);
      } catch (error: any) {
        console.error('Revocation Failed:', error);
        // Rollback on error
        setAdmins(previousAdmins);
        showError('ADMIN REGISTRY ERROR: ' + (error.message || 'Verification failure'));
      }
    }
  };

  const filteredAdmins = admins.filter(admin => 
    (admin.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (admin.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (admin.designation || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Administrators</h1>
          <p className="text-slate-500 text-sm font-medium">Provision and manage administrative access privileges across delivery teams.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search admins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Create Admin</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-100 rounded-[1.5rem] p-5">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[9px] font-black uppercase text-indigo-600 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-lg tracking-wider">Access Protocol Guide</span>
            <p className="text-xs font-black text-indigo-950">How do Administrators log in?</p>
          </div>
          <p className="text-[11px] text-indigo-700 leading-relaxed font-semibold">
            To register a new administrator, click <strong>"Create Admin"</strong> above. Enter their name, email, and designation. Once registered, they should go to the sign-in screen, click <strong>"Sign Up / Set up Password"</strong>, enter their registered email, and configure a password. Once registered, their credentials will grant them access to their dashboard, where they can only manage their own projects and developers.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-100 rounded-3xl animate-pulse border border-slate-200"></div>)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredAdmins.map((admin) => (
                <motion.div
                  key={admin.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group bg-white rounded-3xl border border-slate-200 p-6 hover:shadow-2xl hover:border-indigo-200 transition-all relative flex flex-col justify-between"
                >
                  <div className="absolute top-4 left-4">
                    <div className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-indigo-200 text-indigo-600 bg-indigo-50">
                      Admin
                    </div>
                  </div>

                  <div className="flex flex-col items-center mb-4 pt-2">
                    <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-black mb-3 shadow-xl shadow-indigo-600/20 ring-4 ring-indigo-50 group-hover:bg-slate-900 group-hover:ring-slate-100 transition-all">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-black text-slate-900 text-center tracking-tight text-lg leading-tight">{admin.name}</h3>
                  </div>

                  <div className="space-y-2 bg-slate-50/85 p-4 rounded-2xl border border-slate-100 flex-1 mb-4 shadow-inner group-hover:bg-white group-hover:border-indigo-50 transition-colors">
                    <div className="flex items-center gap-2.5 text-slate-500 overflow-hidden">
                      <div className="p-1.5 bg-white rounded-lg border border-slate-200">
                        <User className="w-3 h-3 text-slate-400" />
                      </div>
                      <span className="text-[10px] font-bold truncate tracking-tight text-slate-600">{admin.designation || 'Administrator'}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-500 overflow-hidden">
                      <div className="p-1.5 bg-white rounded-lg border border-slate-200">
                        <Mail className="w-3 h-3 text-slate-400" />
                      </div>
                      <span className="text-[10px] font-bold truncate tracking-tight text-slate-600">{admin.email}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-auto">
                    <button
                      onClick={() => {
                        setSelectedAdminToEdit(admin);
                        setIsEditModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 border border-transparent hover:border-indigo-100 transition-all flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest active:scale-95 shadow-sm"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit Name</span>
                    </button>

                    <button
                      onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                      disabled={
                        admin.email === 'sayduntuhin.jvai@gmail.com' || 
                        admin.email === 'exceptionhubjvai@gmail.com' || 
                        isSubmitting
                      }
                      className="flex-1 py-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-150 border border-transparent transition-all flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest disabled:opacity-30 disabled:hover:bg-slate-50 disabled:hover:text-slate-400 disabled:hover:border-transparent active:scale-95 shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* New Admin Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20 max-h-[95vh] flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create Administrator</h2>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">Add to security credentials roster</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                setIsSubmitting(true);
                try {
                  const f = e.target as any;
                  const adminData = {
                    name: f.name.value,
                    email: f.email.value,
                    designation: f.designation.value,
                  };

                  await adminService.createAdmin(adminData);
                  showSuccess('Administrator created successfully.');
                  setIsModalOpen(false);
                  fetchAdmins();
                } catch (err: any) {
                  console.error(err);
                  showError('Failed to create Administrator: ' + (err.message || 'unknown error'));
                } finally {
                  setIsSubmitting(false);
                }
              }} className="p-6 sm:p-8 space-y-5 overflow-y-auto no-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input name="name" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. Sarah Jenkins" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                  <input name="email" type="email" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. sarah@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Designation</label>
                  <input name="designation" defaultValue="Administrator" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. Delivery Lead" />
                </div>
                <div className="flex gap-3 pt-6">
                  <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="flex-1 py-3 text-slate-500 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">
                    {isSubmitting ? 'Creating...' : 'Register Administrator'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Admin Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedAdminToEdit && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20 max-h-[95vh] flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Edit Administrator</h2>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">Modify security credentials</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                setIsSubmitting(true);
                try {
                  const f = e.target as any;
                  const newName = f.name.value;
                  const newDesignation = f.designation.value;

                  await adminService.updateAdminName(
                    selectedAdminToEdit.id,
                    selectedAdminToEdit.email,
                    newName,
                    newDesignation
                  );
                  showSuccess('Administrator details updated successfully.');
                  setIsEditModalOpen(false);
                  setSelectedAdminToEdit(null);
                  fetchAdmins();
                } catch (err: any) {
                  console.error(err);
                  showError('Failed to update Administrator: ' + (err.message || 'unknown error'));
                } finally {
                  setIsSubmitting(false);
                }
              }} className="p-6 sm:p-8 space-y-5 overflow-y-auto no-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address (Non-editable)</label>
                  <input 
                    type="email" 
                    disabled 
                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl font-medium text-sm text-slate-500 cursor-not-allowed" 
                    value={selectedAdminToEdit.email} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    name="name" 
                    required 
                    defaultValue={selectedAdminToEdit.name} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" 
                    placeholder="e.g. Sarah Jenkins" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Designation</label>
                  <input 
                    name="designation" 
                    required 
                    defaultValue={selectedAdminToEdit.designation || 'Administrator'} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" 
                    placeholder="e.g. Delivery Lead" 
                  />
                </div>
                <div className="flex gap-3 pt-6">
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSelectedAdminToEdit(null);
                    }} 
                    disabled={isSubmitting} 
                    className="flex-1 py-3 text-slate-500 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting} 
                    className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
