// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProductCounterfeitRegistry {
    enum Role {
        Manufacturer,
        Distributor,
        Retailer,
        Customer,
        Admin
    }

    enum Action {
        Registered,
        Transferred
    }

    struct Product {
        bool exists;
        string productId;
        string name;
        string manufacturerDetails;
        string batchNumber;
        uint256 manufacturingDate;
        address manufacturer;
        address currentOwner;
        uint256 registeredAt;
    }

    struct Txn {
        uint256 timestamp;
        Action action;
        address actor;
        address from;
        address to;
        string location;
        string note;
    }

    address public admin;
    mapping(address => Role) public roles;

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => Txn[]) private histories;

    event RoleUpdated(address indexed user, Role role);
    event ProductRegistered(bytes32 indexed productKey, string productId, address indexed manufacturer);
    event ProductTransferred(
        bytes32 indexed productKey,
        string productId,
        address indexed from,
        address indexed to,
        string location,
        string note
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
        emit RoleUpdated(msg.sender, Role.Admin);
    }

    function setRole(address user, Role role) external onlyAdmin {
        roles[user] = role;
        emit RoleUpdated(user, role);
    }

    function productKey(string memory productId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(productId));
    }

    function registerProduct(
        string calldata productId,
        string calldata name,
        string calldata manufacturerDetails,
        string calldata batchNumber,
        uint256 manufacturingDate
    ) external {
        require(roles[msg.sender] == Role.Manufacturer || roles[msg.sender] == Role.Admin, "not manufacturer");
        require(bytes(productId).length > 0, "productId empty");

        bytes32 key = productKey(productId);
        require(!products[key].exists, "already registered");

        products[key] = Product({
            exists: true,
            productId: productId,
            name: name,
            manufacturerDetails: manufacturerDetails,
            batchNumber: batchNumber,
            manufacturingDate: manufacturingDate,
            manufacturer: msg.sender,
            currentOwner: msg.sender,
            registeredAt: block.timestamp
        });

        histories[key].push(
            Txn({
                timestamp: block.timestamp,
                action: Action.Registered,
                actor: msg.sender,
                from: address(0),
                to: msg.sender,
                location: "",
                note: ""
            })
        );

        emit ProductRegistered(key, productId, msg.sender);
    }

    function transferProduct(
        string calldata productId,
        address to,
        string calldata location,
        string calldata note
    ) external {
        require(to != address(0), "to is zero");

        bytes32 key = productKey(productId);
        require(products[key].exists, "not registered");

        Product storage p = products[key];
        require(p.currentOwner == msg.sender, "not owner");

        address from = p.currentOwner;
        p.currentOwner = to;

        histories[key].push(
            Txn({
                timestamp: block.timestamp,
                action: Action.Transferred,
                actor: msg.sender,
                from: from,
                to: to,
                location: location,
                note: note
            })
        );

        emit ProductTransferred(key, productId, from, to, location, note);
    }

    function verifyProduct(string calldata productId) external view returns (bool exists, address currentOwner) {
        bytes32 key = productKey(productId);
        return (products[key].exists, products[key].currentOwner);
    }

    function getProduct(string calldata productId) external view returns (Product memory) {
        bytes32 key = productKey(productId);
        require(products[key].exists, "not registered");
        return products[key];
    }

    function getProductHistory(string calldata productId) external view returns (Txn[] memory) {
        bytes32 key = productKey(productId);
        require(products[key].exists, "not registered");
        return histories[key];
    }
}

