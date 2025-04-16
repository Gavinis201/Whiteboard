import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="bg-gray-100 py-4 text-center w-full mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <p className="text-sm sm:text-base text-gray-600">
                    &copy; {new Date().getFullYear()} WhiteBoard. All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;