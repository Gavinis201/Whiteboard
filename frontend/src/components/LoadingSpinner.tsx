import React from 'react';

interface LoadingSpinnerProps {
    text?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
    text = 'Loading...', 
    size = 'md' 
}) => {
    const sizeClasses = {
        sm: 'w-6 h-6',
        md: 'w-12 h-12',
        lg: 'w-16 h-16'
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 flex flex-col items-center space-y-6 shadow-2xl max-w-sm mx-4">
                <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-purple-200 border-t-purple-600`}></div>
                <div className="text-center">
                    <p className="text-gray-800 font-semibold text-lg">{text}</p>
                    <p className="text-gray-500 text-sm mt-1">Please wait...</p>
                </div>
            </div>
        </div>
    );
}; 