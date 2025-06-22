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
        md: 'w-8 h-8',
        lg: 'w-12 h-12'
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4 shadow-xl">
                <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-purple-200 border-t-purple-600`}></div>
                <p className="text-gray-700 font-medium">{text}</p>
            </div>
        </div>
    );
}; 